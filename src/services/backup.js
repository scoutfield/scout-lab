import { normalizeSettings } from '../settings.js';
import { validateSourceUrl } from './query.js';

export const BACKUP_FORMAT = 'scout-lab-backup';
export const BACKUP_VERSION = 2;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

const MAX_ENTRIES = 10_000;
const MAX_NOTE_LENGTH = 50_000;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DURABLE_KEYS = ['settings', 'userState', 'dailyNotes', 'snapshots'];

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clone = (value) => JSON.parse(JSON.stringify(value));

const assertObject = (value, label) => {
  if (!isObject(value)) throw new Error(`${label} must be an object.`);
};

const assertTimestamp = (value, label) => {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} has an invalid updated time.`);
  }
};

const assertMapSize = (value, label, limit = MAX_ENTRIES) => {
  assertObject(value, label);
  if (Object.keys(value).length > limit) throw new Error(`${label} has too many entries.`);
};

const validateSettings = (settings) => {
  assertObject(settings, 'Settings');
  const preferences = settings.preferences;
  assertObject(preferences, 'Settings preferences');
  if (!['system', 'light', 'dark'].includes(preferences.theme)) throw new Error('Settings contains an invalid theme.');
  if (!['comfortable', 'compact'].includes(preferences.density)) throw new Error('Settings contains an invalid density.');
  if (!['last-used', 'today', 'code', 'models', 'datasets', 'papers', 'posts', 'library'].includes(preferences.startupSection)) {
    throw new Error('Settings contains an invalid startup workbench.');
  }
  if (!['foreground', 'background'].includes(preferences.openLinks)) throw new Error('Settings contains an invalid link behavior.');
  return normalizeSettings(settings);
};

const validateUserState = (value) => {
  assertMapSize(value, 'Annotations');
  return Object.fromEntries(Object.entries(value).map(([id, entry]) => {
    if (!id || id.length > 500) throw new Error('Annotations contains an invalid item ID.');
    assertObject(entry, `Annotation ${id}`);
    if (entry.favorite !== undefined && typeof entry.favorite !== 'boolean') throw new Error(`Annotation ${id} has an invalid favorite value.`);
    if (entry.hidden !== undefined && typeof entry.hidden !== 'boolean') throw new Error(`Annotation ${id} has an invalid hidden value.`);
    if (entry.comment !== undefined && (typeof entry.comment !== 'string' || entry.comment.length > MAX_NOTE_LENGTH)) {
      throw new Error(`Annotation ${id} has an invalid comment.`);
    }
    assertTimestamp(entry.updatedAt, `Annotation ${id}`);
    if (entry.savedAt !== undefined) assertTimestamp(entry.savedAt, `Annotation ${id}`);
    const libraryCard = entry.libraryCard === undefined ? undefined : validateSnapshotValue(entry.libraryCard);
    if (libraryCard !== undefined) {
      assertObject(libraryCard, `Annotation ${id} Library card`);
      if (libraryCard.id !== id || !libraryCard.title || !libraryCard.type || !libraryCard.source
        || !validateSourceUrl(libraryCard.url, libraryCard.source)) {
        throw new Error(`Annotation ${id} has an invalid Library card.`);
      }
    }
    return [id, {
      ...(entry.favorite === undefined ? {} : { favorite: entry.favorite }),
      ...(entry.hidden === undefined ? {} : { hidden: entry.hidden }),
      ...(entry.comment === undefined ? {} : { comment: entry.comment }),
      ...(entry.savedAt === undefined ? {} : { savedAt: entry.savedAt }),
      ...(libraryCard === undefined ? {} : { libraryCard }),
      updatedAt: entry.updatedAt,
    }];
  }));
};

const validateDailyNotes = (value) => {
  assertMapSize(value, 'Daily notes', 2_000);
  return Object.fromEntries(Object.entries(value).map(([date, note]) => {
    if (!DATE_KEY.test(date) || typeof note !== 'string' || note.length > MAX_NOTE_LENGTH) {
      throw new Error('Daily notes contains an invalid date or note.');
    }
    return [date, note];
  }));
};

const validateSnapshotValue = (value, context = {}, depth = 0) => {
  if (depth > 14) throw new Error('Snapshots are nested too deeply.');
  if (typeof value === 'string') {
    if (value.length > 100_000) throw new Error('Snapshots contains an oversized string.');
    return value;
  }
  if (value === null || ['number', 'boolean'].includes(typeof value)) return value;
  if (Array.isArray(value)) {
    if (value.length > 2_000) throw new Error('Snapshots contains an oversized collection.');
    return value.map((entry) => validateSnapshotValue(entry, context, depth + 1));
  }
  assertObject(value, 'Snapshot value');
  if (Object.keys(value).length > 5_000) throw new Error('Snapshots contains an oversized object.');
  const source = typeof value.source === 'string' ? value.source : context.source;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (key === 'url' && entry && !validateSourceUrl(entry, source)) throw new Error('Snapshots contains an unsafe URL.');
    return [key, validateSnapshotValue(entry, { source }, depth + 1)];
  }));
};

const validateSnapshots = (value) => {
  assertMapSize(value, 'Daily snapshots', 2_000);
  return Object.fromEntries(Object.entries(value).map(([date, snapshot]) => {
    if (!DATE_KEY.test(date)) throw new Error('Daily snapshots contains an invalid date.');
    return [date, validateSnapshotValue(snapshot)];
  }));
};

const normalizeData = (data) => {
  assertObject(data, 'Backup data');
  const unknown = Object.keys(data).filter((key) => !DURABLE_KEYS.includes(key));
  if (unknown.length) throw new Error(`Backup contains unsupported data: ${unknown.join(', ')}.`);
  return {
    settings: validateSettings(data.settings),
    userState: validateUserState(data.userState),
    dailyNotes: validateDailyNotes(data.dailyNotes),
    snapshots: validateSnapshots(data.snapshots),
  };
};

export const createBackup = (durableData, now = new Date()) => ({
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportedAt: now.toISOString(),
  data: clone(Object.fromEntries(DURABLE_KEYS.map((key) => [key, durableData[key]]))),
});

export const parseBackup = (text) => {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) {
    throw new Error('Backup file is too large.');
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Backup file is not valid JSON.');
  }
  assertObject(parsed, 'Backup');
  if (parsed.format !== BACKUP_FORMAT) throw new Error('This is not a Scout Lab backup.');
  if (parsed.version !== BACKUP_VERSION) throw new Error('This backup version is not supported.');
  if (typeof parsed.exportedAt !== 'string' || Number.isNaN(Date.parse(parsed.exportedAt))) {
    throw new Error('Backup has an invalid export time.');
  }
  return { ...parsed, data: normalizeData(parsed.data) };
};

const newestEntries = (local = {}, imported = {}) => Object.fromEntries(
  new Set([...Object.keys(local), ...Object.keys(imported)]).values().map((id) => {
    const localEntry = local[id];
    const importedEntry = imported[id];
    if (!localEntry) return [id, importedEntry];
    if (!importedEntry) return [id, localEntry];
    return [id, Date.parse(importedEntry.updatedAt) > Date.parse(localEntry.updatedAt) ? importedEntry : localEntry];
  }),
);

export const mergeBackupData = (local, imported) => ({
  settings: normalizeSettings(imported.settings),
  userState: newestEntries(local.userState, imported.userState),
  dailyNotes: { ...local.dailyNotes, ...imported.dailyNotes },
  snapshots: { ...local.snapshots, ...imported.snapshots },
});

export const summarizeBackup = (backup) => ({
  annotations: Object.keys(backup.data.userState).length,
  notes: Object.keys(backup.data.dailyNotes).length,
  snapshots: Object.keys(backup.data.snapshots).length,
});

export const backupFileName = (now = new Date()) => `scout-lab-backup-${now.toISOString().slice(0, 10)}.json`;
