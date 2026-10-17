import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getCache,
  hydrateLibraryAnnotations,
  getDailyNote,
  getPreferences,
  getSnapshot,
  getSettings,
  getUserState,
  getWorkbenchFilterDefaults,
  getWorkbenchFilters,
  removeCache,
  resetPreferences,
  restoreWorkbenchFilterDefaults,
  setCache,
  setFilterDefaults,
  setDailyNote,
  setPreferences,
  setSnapshot,
  setUserItemState,
  setWorkbenchFilters,
} from '../src/services/storage.js';

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe('query-aware storage', () => {
  it('migrates the legacy topic only into topic-aware workbenches', () => {
    localStorage.setItem('scout-lab:settings', JSON.stringify({
      selectedSection: 'models',
      selectedTopic: 'rag',
    }));

    const settings = getSettings();

    expect(settings.selectedSection).toBe('models');
    expect(settings.filters.code).not.toHaveProperty('topic');
    expect(settings.filters.models.topic).toBe('rag');
    expect(settings.filters.papers.topic).toBe('rag');
  });

  it('updates one workbench immutably without erasing other filters', () => {
    const before = getWorkbenchFilters('code');
    const after = setWorkbenchFilters('code', { language: 'python' });

    expect(before.language).toBe('all');
    expect(after.language).toBe('python');
    expect(getWorkbenchFilters('models').rank).toBe('trending');
  });

  it('keeps current filters separate from saved defaults', () => {
    setWorkbenchFilters('code', { language: 'python' });
    setFilterDefaults('code', { language: 'python' });
    setWorkbenchFilters('code', { language: 'rust' });

    expect(getWorkbenchFilters('code').language).toBe('rust');
    expect(getWorkbenchFilterDefaults('code').language).toBe('python');
    expect(restoreWorkbenchFilterDefaults('code').language).toBe('python');
    expect(getWorkbenchFilters('code').language).toBe('python');
  });

  it('resets preferences and filter defaults without deleting annotations', () => {
    setUserItemState('github:one', { favorite: true });
    setFilterDefaults('code', { language: 'python' });
    setPreferences({ textSize: 'standard' });

    resetPreferences();

    expect(getWorkbenchFilterDefaults('code').language).toBe('all');
    expect(getPreferences().textSize).toBe('large');
    expect(getUserState()['github:one'].favorite).toBe(true);
  });

  it('stores cache entries by the complete query and expires them', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:00:00Z'));
    const query = { section: 'models', filters: { rank: 'trending', task: 'all' } };

    setCache(query, [{ id: 'one' }], 1000, { notice: 'Live' });
    expect(getCache(query)).toEqual(expect.objectContaining({ cards: [{ id: 'one' }], notice: 'Live' }));

    vi.advanceTimersByTime(1001);
    expect(getCache(query)).toBeNull();
  });

  it('removes only the matching cache entry', () => {
    const first = { section: 'models', filters: { rank: 'trending' } };
    const second = { section: 'models', filters: { rank: 'downloads' } };
    setCache(first, [{ id: 'one' }]);
    setCache(second, [{ id: 'two' }]);

    removeCache(first);

    expect(getCache(first)).toBeNull();
    expect(getCache(second)?.cards).toEqual([{ id: 'two' }]);
  });

  it('preserves daily notes, snapshots, and immutable item annotations', () => {
    setDailyNote('2026-08-28', 'A note');
    setSnapshot('2026-08-28', { sections: { today: { cards: [] } } });
    const first = setUserItemState('item:1', { favorite: true });
    const second = setUserItemState('item:1', { comment: 'Read this.' });

    expect(getDailyNote('2026-08-28')).toBe('A note');
    expect(getSnapshot('2026-08-28').sections.today.cards).toEqual([]);
    expect(first['item:1'].comment).toBeUndefined();
    expect(second['item:1']).toMatchObject({ favorite: true, comment: 'Read this.' });
    expect(getUserState()).toEqual(second);
  });

  it('stores Library snapshots with annotations and backfills legacy favorites', () => {
    const card = {
      id: 'github:one', source: 'github', section: 'code', type: 'Code', title: 'one',
      url: 'https://github.com/owner/one', summary: 'One.', tags: [], links: [],
    };
    setUserItemState(card.id, { favorite: true }, card);
    expect(getUserState()[card.id]).toMatchObject({ favorite: true, libraryCard: { title: 'one' } });

    localStorage.setItem('scout-lab:user-state', JSON.stringify({
      'github:legacy': { comment: 'Remember', updatedAt: '2026-08-28T00:00:00Z' },
    }));
    setSnapshot('2026-08-28', { sections: { code: { cards: [{ ...card, id: 'github:legacy', title: 'legacy' }] } } });
    const hydrated = hydrateLibraryAnnotations();
    expect(hydrated['github:legacy'].libraryCard.title).toBe('legacy');
  });

  it('recovers from malformed stored JSON', () => {
    localStorage.setItem('scout-lab:settings', '{bad json');
    expect(getSettings().selectedSection).toBe('today');
  });
});

describe('storage under a full browser quota', () => {
  const LIMIT = 4_000;
  const used = () => Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .reduce((sum, key) => sum + key.length + localStorage.getItem(key).length, 0);

  beforeEach(() => {
    const realSetItem = localStorage.setItem;
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      const existing = localStorage.getItem(key);
      const growth = key.length + `${value}`.length - (existing === null ? 0 : key.length + existing.length);
      if (used() + growth > LIMIT) throw new DOMException('full', 'QuotaExceededError');
      return realSetItem(key, value);
    });
  });

  afterEach(() => vi.restoreAllMocks());

  const filler = (name, ttl, size = 900) => setCache({ name }, [{ id: name, pad: 'x'.repeat(size) }], ttl);

  it('evicts expired feed caches to make room for a new one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T00:00:00Z'));
    filler('old-a', 1_000); filler('old-b', 1_000); filler('old-c', 1_000);
    vi.advanceTimersByTime(5_000);

    setCache({ name: 'fresh' }, [{ id: 'fresh', pad: 'y'.repeat(1_500) }], 60_000);

    expect(getCache({ name: 'fresh' })?.cards[0].id).toBe('fresh');
    expect(getCache({ name: 'old-a' })).toBeNull();
  });

  it('never throws when a feed cache cannot fit at all', () => {
    expect(() => setCache({ name: 'huge' }, [{ pad: 'z'.repeat(LIMIT * 2) }], 60_000)).not.toThrow();
    expect(getCache({ name: 'huge' })).toBeNull();
  });

  it('never throws when a daily snapshot cannot fit', () => {
    expect(() => setSnapshot('2026-10-04', { cards: [{ pad: 'z'.repeat(LIMIT * 2) }] })).not.toThrow();
  });

  it('gives up feed caches before failing to save a favorite', () => {
    // Together these leave too little room for the favorite until a cache is evicted.
    filler('live-a', 60_000, 1_100); filler('live-b', 60_000, 1_100); filler('live-c', 60_000, 1_100);
    expect(getCache({ name: 'live-a' })).not.toBeNull();

    setUserItemState('github:example/repo', { favorite: true }, {
      id: 'github:example/repo', source: 'github', section: 'code', type: 'Code', title: 'example/repo',
      url: 'https://github.com/example/repo', summary: 'keep me', tags: [],
    });

    expect(getUserState()['github:example/repo'].favorite).toBe(true);
    expect(getCache({ name: 'live-a' })).toBeNull();
  });

  it('still reports a failure for durable data that cannot fit even after evicting caches', () => {
    expect(() => setDailyNote('2026-10-04', 'n'.repeat(LIMIT * 2))).toThrow(/full|quota/i);
  });
});
