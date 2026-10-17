import {
  createDefaultPreferences,
  normalizePreferences,
  normalizeSettings,
} from '../settings.js';
import { createDefaultFilters, normalizeWorkbenchFilters } from '../workbenches.js';
import { stableSerialize } from './query.js';
import { backfillLibraryAnnotations, updateLibraryAnnotation } from './library.js';

const STORE_PREFIX = 'scout-lab';
const ONE_HOUR = 60 * 60 * 1000;

const safeParse = (value, fallback = null) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const read = (key, fallback = null) => safeParse(localStorage.getItem(`${STORE_PREFIX}:${key}`), fallback);

const isQuotaError = (error) => (
  error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED'
  || error?.code === 22 || error?.code === 1014
);

const CACHE_KEY_PREFIX = `${STORE_PREFIX}:cache:`;

// Feed caches are regenerable, so they are what gives way when the browser quota is reached.
const evictCaches = (keep) => {
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key) => key?.startsWith(CACHE_KEY_PREFIX) && key !== keep);
  const expired = keys.filter((key) => {
    const entry = safeParse(localStorage.getItem(key));
    return !entry?.expiresAt || Date.now() > entry.expiresAt;
  });
  (expired.length ? expired : keys).forEach((key) => localStorage.removeItem(key));
};

const write = (key, value) => {
  const fullKey = `${STORE_PREFIX}:${key}`;
  const json = JSON.stringify(value);
  try {
    localStorage.setItem(fullKey, json);
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    // Drop expired caches first, then every cache, retrying after each step.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      evictCaches(fullKey);
      try {
        localStorage.setItem(fullKey, json);
        return value;
      } catch (retryError) {
        if (!isQuotaError(retryError)) throw retryError;
      }
    }
    throw error;
  }
  return value;
};

// Derived data (feed caches, daily snapshots) must never break a load when storage is full.
const writeDerived = (key, value) => {
  try {
    return write(key, value);
  } catch (error) {
    if (isQuotaError(error)) return value;
    throw error;
  }
};

const remove = (key) => localStorage.removeItem(`${STORE_PREFIX}:${key}`);

const queryCacheKey = (query) => `cache:v4:${stableSerialize(query)}`;

export const getCache = (query) => {
  const entry = read(queryCacheKey(query));
  if (!entry || !entry.expiresAt || Date.now() > entry.expiresAt) return null;
  return entry;
};

export const getStaleCache = (query) => read(queryCacheKey(query));

export const setCache = (query, cards, ttl = ONE_HOUR, metadata = {}) => writeDerived(queryCacheKey(query), {
  cards,
  ...metadata,
  expiresAt: Number.isFinite(ttl) ? Date.now() + ttl : Number.MAX_SAFE_INTEGER,
  savedAt: new Date().toISOString(),
});

export const removeCache = (query) => remove(queryCacheKey(query));

export const getUserState = () => read('user-state', {});

export const setUserItemState = (itemId, patch, card, now = new Date()) => {
  const current = getUserState();
  const next = {
    ...current,
    [itemId]: updateLibraryAnnotation(current[itemId], patch, card?.id === itemId ? card : undefined, now),
  };
  return write('user-state', next);
};

export const getDailyNote = (dateKey) => read(`note:${dateKey}`, '');
export const setDailyNote = (dateKey, note) => write(`note:${dateKey}`, note);
export const getSnapshot = (dateKey) => read(`snapshot:${dateKey}`, null);
export const setSnapshot = (dateKey, snapshot) => writeDerived(`snapshot:${dateKey}`, snapshot);

export const getSettings = () => {
  return normalizeSettings(read('settings', {}));
};

export const setSettings = (patch) => {
  const current = getSettings();
  return write('settings', normalizeSettings({
    ...current,
    ...patch,
    filters: patch.filters ? { ...current.filters, ...patch.filters } : current.filters,
    filterDefaults: patch.filterDefaults
      ? { ...current.filterDefaults, ...patch.filterDefaults }
      : current.filterDefaults,
    preferences: patch.preferences
      ? { ...current.preferences, ...patch.preferences, todayMix: patch.preferences.todayMix || current.preferences.todayMix }
      : current.preferences,
  }));
};

export const getPreferences = () => ({ ...getSettings().preferences, todayMix: { ...getSettings().preferences.todayMix } });

export const setPreferences = (patch) => {
  const current = getSettings();
  const preferences = normalizePreferences({
    ...current.preferences,
    ...patch,
    todayMix: patch.todayMix ? { ...current.preferences.todayMix, ...patch.todayMix } : current.preferences.todayMix,
  });
  setSettings({ preferences });
  return { ...preferences, todayMix: { ...preferences.todayMix } };
};

export const getWorkbenchFilters = (section) => ({ ...getSettings().filters[section] });

export const setWorkbenchFilters = (section, patch) => {
  const settings = getSettings();
  const next = normalizeWorkbenchFilters(section, { ...settings.filters[section], ...patch });
  setSettings({ filters: { ...settings.filters, [section]: next } });
  return { ...next };
};

export const getWorkbenchFilterDefaults = (section) => ({ ...getSettings().filterDefaults[section] });

export const setFilterDefaults = (section, values) => {
  const settings = getSettings();
  const next = normalizeWorkbenchFilters(section, { ...settings.filterDefaults[section], ...values });
  setSettings({ filterDefaults: { ...settings.filterDefaults, [section]: next } });
  return { ...next };
};

export const restoreWorkbenchFilterDefaults = (section) => {
  const defaults = getWorkbenchFilterDefaults(section);
  return setWorkbenchFilters(section, defaults);
};

export const restoreFactoryFilterDefaults = (section) => setFilterDefaults(section, createDefaultFilters()[section]);

export const restoreAllFactoryFilterDefaults = () => {
  const filterDefaults = createDefaultFilters();
  setSettings({ filterDefaults });
  return filterDefaults;
};

export const resetPreferences = () => {
  const settings = getSettings();
  return setSettings({
    preferences: createDefaultPreferences(),
    filterDefaults: createDefaultFilters(),
    filters: settings.filters,
    selectedSection: settings.selectedSection,
  });
};

const entriesByPrefix = (prefix) => {
  const fullPrefix = `${STORE_PREFIX}:${prefix}`;
  return Object.fromEntries(Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key) => key?.startsWith(fullPrefix))
    .map((key) => [key.slice(fullPrefix.length), safeParse(localStorage.getItem(key))]));
};

export const getAllDailyNotes = () => entriesByPrefix('note:');
export const getAllSnapshots = () => entriesByPrefix('snapshot:');

export const hydrateLibraryAnnotations = () => {
  const current = getUserState();
  const hydrated = backfillLibraryAnnotations(current, getAllSnapshots());
  if (stableSerialize(hydrated) !== stableSerialize(current)) write('user-state', hydrated);
  return hydrated;
};

export const getDurableData = () => ({
  settings: getSettings(),
  userState: getUserState(),
  dailyNotes: getAllDailyNotes(),
  snapshots: getAllSnapshots(),
});

export const applyDurableData = (data) => {
  const previous = new Map(Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key) => key?.startsWith(`${STORE_PREFIX}:`))
    .map((key) => [key, localStorage.getItem(key)]));

  try {
    write('settings', normalizeSettings(data.settings));
    write('user-state', data.userState);
    Object.keys(getAllDailyNotes()).forEach((date) => remove(`note:${date}`));
    Object.keys(getAllSnapshots()).forEach((date) => remove(`snapshot:${date}`));
    Object.entries(data.dailyNotes).forEach(([date, note]) => write(`note:${date}`, note));
    Object.entries(data.snapshots).forEach(([date, snapshot]) => write(`snapshot:${date}`, snapshot));
  } catch (error) {
    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key) => key?.startsWith(`${STORE_PREFIX}:`))
      .forEach((key) => localStorage.removeItem(key));
    previous.forEach((value, key) => localStorage.setItem(key, value));
    throw error;
  }
  return getDurableData();
};
