import { describe, expect, it } from 'vitest';

import {
  BACKUP_FORMAT,
  MAX_BACKUP_BYTES,
  createBackup,
  mergeBackupData,
  parseBackup,
} from '../src/services/backup.js';
import { normalizeSettings } from '../src/settings.js';

const localData = () => ({
  settings: normalizeSettings({ selectedSection: 'code' }),
  userState: {
    'github:one': {
      favorite: true, comment: 'Local', savedAt: '2026-08-29T09:00:00.000Z',
      updatedAt: '2026-08-29T10:00:00.000Z',
      libraryCard: {
        id: 'github:one', source: 'github', section: 'code', type: 'Code', title: 'One',
        url: 'https://github.com/owner/one', summary: 'One.', tags: [], links: [],
      },
    },
  },
  dailyNotes: { '2026-08-28': 'Keep me' },
  snapshots: { '2026-08-28': { date: '2026-08-28', sections: {} } },
});

describe('portable backup', () => {
  it('round-trips Posts filters, lane counts, and saved discussion/article links', () => {
    const data = localData();
    data.settings = normalizeSettings({
      filters: { posts: { time: 'day', topic: 'multimodal', minPoints: '20', minComments: '5' } },
      preferences: { todayMix: { code: 1, models: 0, datasets: 0, papers: 0, posts: 3 } },
    });
    data.userState['hn:123'] = {
      favorite: true, comment: 'Keep this discussion', updatedAt: '2026-10-05T00:00:00Z',
      libraryCard: {
        id: 'hn:123', title: 'AI video', type: 'Post', source: 'hackernews',
        url: 'https://news.ycombinator.com/item?id=123',
        links: [{ label: 'Article', source: 'web', url: 'https://example.com/video' }],
      },
    };
    const restored = parseBackup(JSON.stringify(createBackup(data))).data;
    expect(restored.settings.filters.posts).toEqual(data.settings.filters.posts);
    expect(restored.settings.preferences.todayMix.posts).toBe(3);
    expect(restored.userState['hn:123'].libraryCard.links[0].url).toBe('https://example.com/video');
    expect(restored.userState['hn:123'].comment).toBe('Keep this discussion');
  });

  it('creates a versioned backup from durable data only', () => {
    const backup = createBackup({
      ...localData(),
      cache: { secret: true },
      archiveHandle: { name: 'iCloud' },
    }, new Date('2026-08-29T12:00:00.000Z'));

    expect(backup).toMatchObject({
      format: BACKUP_FORMAT,
      version: 2,
      exportedAt: '2026-08-29T12:00:00.000Z',
    });
    expect(backup.data.settings.version).toBe(5);
    expect(backup.data.cache).toBeUndefined();
    expect(backup.data.archiveHandle).toBeUndefined();
    expect(backup.data.learnProgress).toBeUndefined();
  });

  it('parses a valid backup and rejects unsupported, oversized, or unsafe input', () => {
    const valid = JSON.stringify(createBackup(localData()));
    expect(parseBackup(valid).data.dailyNotes['2026-08-28']).toBe('Keep me');
    expect(parseBackup(valid).data.userState['github:one'].libraryCard.title).toBe('One');

    expect(() => parseBackup('{bad')).toThrow(/valid JSON/i);
    expect(() => parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 99, data: {} }))).toThrow(/version/i);
    expect(() => parseBackup(JSON.stringify({ ...createBackup(localData()), version: 1 }))).toThrow(/version/i);
    expect(() => parseBackup('x'.repeat(MAX_BACKUP_BYTES + 1))).toThrow(/too large/i);

    const unsafe = createBackup({
      ...localData(),
      snapshots: {
        '2026-08-29': {
          date: '2026-08-29',
          sections: { code: { cards: [{ source: 'github', url: 'javascript:alert(1)' }] } },
        },
      },
    });
    expect(() => parseBackup(JSON.stringify(unsafe))).toThrow(/URL/i);

    const unsafeLibrary = createBackup(localData());
    unsafeLibrary.data.userState['github:one'].libraryCard.url = 'javascript:alert(1)';
    expect(() => parseBackup(JSON.stringify(unsafeLibrary))).toThrow(/URL/i);

    const mismatchedLibrary = createBackup(localData());
    mismatchedLibrary.data.userState['github:one'].libraryCard.id = 'github:other';
    expect(() => parseBackup(JSON.stringify(mismatchedLibrary))).toThrow(/Library card/i);
  });

  it('merges annotations by timestamp and daily records by date', () => {
    const imported = {
      ...localData(),
      settings: normalizeSettings({ selectedSection: 'papers', preferences: { theme: 'dark', textSize: 'standard' } }),
      userState: {
        'github:one': { favorite: false, comment: 'Older', updatedAt: '2026-08-29T09:00:00.000Z' },
        'github:two': { favorite: true, updatedAt: '2026-08-29T11:00:00.000Z' },
      },
      dailyNotes: { '2026-08-29': 'Imported' },
      snapshots: { '2026-08-29': { date: '2026-08-29', sections: {} } },
    };

    const merged = mergeBackupData(localData(), imported);

    expect(merged.settings.selectedSection).toBe('papers');
    expect(merged.settings.preferences.theme).toBe('dark');
    expect(merged.settings.preferences.textSize).toBe('standard');
    expect(merged.userState['github:one'].comment).toBe('Local');
    expect(merged.userState['github:two'].favorite).toBe(true);
    expect(merged.dailyNotes).toEqual({ '2026-08-28': 'Keep me', '2026-08-29': 'Imported' });
    expect(Object.keys(merged.snapshots)).toEqual(['2026-08-28', '2026-08-29']);
  });
});
