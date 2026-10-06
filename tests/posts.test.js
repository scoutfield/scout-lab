import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSection, composeTodayCards, POSTS_SOURCE_REVISION } from '../src/services/feeds.js';
import { DEFAULT_REDDIT_COMMUNITIES } from '../src/settings.js';
import { setCache } from '../src/services/storage.js';
import { createDefaultFilters, POSTS_CACHE_TTL } from '../src/workbenches.js';

const hit = (id, title = 'AI agents', points = 40, comments = 5, hours = 1) => ({
  objectID: `${id}`, title, points, num_comments: comments,
  created_at: new Date(Date.now() - hours * 3600_000).toISOString(),
});
const response = (data) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const postsOnly = { code: 0, models: 0, datasets: 0, papers: 0, posts: 2 };
const sourceMock = (posts) => vi.fn(async (url) => `${url}`.includes('hn.algolia.com')
  ? response(typeof posts === 'function' ? posts(new URL(url)) : { hits: posts, nbPages: 1 })
  : `${url}`.includes('github') ? new Response('<html></html>')
    : `${url}`.includes('arxiv') ? new Response('<feed></feed>') : response([]));

beforeEach(() => { localStorage.clear(); vi.useRealTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('unified Posts feed', () => {
  it('retrieves page-two candidates, merges recent stories, and deduplicates IDs before ranking', async () => {
    const filler = Array.from({ length: 200 }, (_, i) => hit(`other-${i}`, 'Unrelated story'));
    const fresh = hit('fresh', 'Fresh LLM', 40, 5, 1);
    const old = hit('old', 'Older Claude', 300, 60, 30);
    const mock = sourceMock((url) => url.pathname.endsWith('search_by_date')
      ? { hits: [fresh, hit('text', 'New text-to-video model', 35, 2, 2)], nbPages: 1 }
      : { hits: url.searchParams.get('page') === '0' ? filler : [old, fresh], nbPages: 2 });
    vi.stubGlobal('fetch', mock);
    const result = await fetchSection('posts', createDefaultFilters().posts);
    expect(result.cards.map(({ id }) => id)).toEqual(['hn:fresh', 'hn:text', 'hn:old']);
    expect(mock).toHaveBeenCalledTimes(5);
    expect(result.status).toMatchObject({ sourceRevision: POSTS_SOURCE_REVISION, stale: false, candidates: 203 });
  });

  it('applies time, topic, points, and comments even if the upstream returns ineligible stories', async () => {
    vi.stubGlobal('fetch', sourceMock([
      hit('good', 'Claude tool', 60, 20), hit('few-points', 'LLM tool', 10, 30),
      hit('few-comments', 'LLM tool', 80, 2), hit('old', 'LLM tool', 100, 30, 25),
      hit('wrong-topic', 'AI image generator', 100, 30), hit('not-ai', 'Travel agents', 100, 30),
      { ...hit('invalid'), created_at: 'bad' }, hit('future', 'AI tool', 100, 30, -1),
    ]));
    const result = await fetchSection('posts', { time: 'day', topic: 'llms', minPoints: '50', minComments: '20' });
    expect(result.cards.map(({ id }) => id)).toEqual(['hn:good']);
  });

  it('breaks equal scores deterministically and retains only 24 unique cards', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
    vi.stubGlobal('fetch', sourceMock(Array.from({ length: 30 }, (_, i) => hit(`${100 + i}`)).reverse()));
    const result = await fetchSection('posts', createDefaultFilters().posts);
    expect(result.cards).toHaveLength(24);
    expect(result.cards[0].id).toBe('hn:100');
  });

  it('bounds each candidate pool to 1,000 hits and reports limited coverage', async () => {
    const mock = sourceMock((url) => ({
      hits: Array.from({ length: 200 }, (_, i) => hit(`${url.searchParams.get('page')}-${i}`, 'Other story')),
      nbPages: 20, nbHits: 4000,
    }));
    vi.stubGlobal('fetch', mock);
    const result = await fetchSection('posts', createDefaultFilters().posts);
    expect(mock).toHaveBeenCalledTimes(12);
    expect(result.status.limited).toBe(true);
    expect(result.cards).toEqual([]);
  });

  it('expires Posts after 15 minutes and preserves valid empty results', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
    const mock = sourceMock([]); vi.stubGlobal('fetch', mock);
    const filters = createDefaultFilters().posts;
    const empty = await fetchSection('posts', filters);
    expect(empty.cards).toEqual([]); expect(empty.status.stale).toBe(false);
    vi.advanceTimersByTime(POSTS_CACHE_TTL - 1);
    expect((await fetchSection('posts', filters)).cached).toBe(true);
    vi.advanceTimersByTime(2);
    expect((await fetchSection('posts', filters)).cached).toBe(false);
    expect(mock).toHaveBeenCalledTimes(8);
  });

  it('uses an expired matching Posts cache on outage, otherwise shows the source fallback', async () => {
    const filters = createDefaultFilters().posts;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    setCache({ section: 'posts', filters, postsRevision: POSTS_SOURCE_REVISION, redditCommunities: [...DEFAULT_REDDIT_COMMUNITIES] }, [{ id: 'hn:saved' }], -1, {
      status: { label: 'Hacker News', sourceRevision: POSTS_SOURCE_REVISION },
    });
    const saved = await fetchSection('posts', filters);
    expect(saved.cards).toEqual([{ id: 'hn:saved' }]); expect(saved.status.stale).toBe(true);
    localStorage.clear();
    const fallback = await fetchSection('posts', filters);
    expect(fallback.cards[0].id).toBe('fallback:hn:ai'); expect(fallback.status.stale).toBe(true);
  });
});

describe('Posts in Today', () => {
  it('replaces hidden Posts before selecting the lane and reports real shortfalls', () => {
    const result = composeTodayCards({ posts: [{ id: 'one' }, { id: 'two' }, { id: 'three' }] },
      { ...postsOnly, posts: 3 }, { one: { hidden: true } });
    expect(result.cards.map(({ id }) => id)).toEqual(['two', 'three']);
    expect(result.shortfalls).toEqual({ posts: 1 });
  });

  it('uses current Posts filters in Today and does not reuse a queue for another threshold', async () => {
    const mock = sourceMock([hit('low', 'AI tool', 10), hit('high', 'AI agents', 60)]);
    vi.stubGlobal('fetch', mock);
    const filters = createDefaultFilters();
    const options = { allFilters: filters, todayMix: postsOnly };
    expect((await fetchSection('today', {}, options)).cards).toHaveLength(2);
    expect((await fetchSection('today', {}, options)).cached).toBe(true);
    filters.posts = { ...filters.posts, minPoints: '50' };
    const narrowed = await fetchSection('today', {}, options);
    expect(narrowed.cached).toBe(false);
    expect(narrowed.cards.map(({ id }) => id)).toEqual(['hn:high']);
    expect(narrowed.status.sources.posts.label).toBe('Hacker News · Reddit unavailable');
  });

  it('does not extend the remaining lifetime of an already-cached Posts source', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
    const mock = sourceMock([hit('one')]); vi.stubGlobal('fetch', mock);
    const filters = createDefaultFilters();
    const posts = await fetchSection('posts', filters.posts);
    vi.advanceTimersByTime(14 * 60_000);
    const options = { allFilters: filters, todayMix: postsOnly };
    const today = await fetchSection('today', {}, options);
    expect(today.cacheExpiresAt).toBe(posts.cacheExpiresAt);
    vi.advanceTimersByTime(60_001);
    const refreshed = await fetchSection('today', {}, options);
    expect(refreshed.cached).toBe(false);
    expect(mock.mock.calls.filter(([url]) => `${url}`.includes('hn.algolia.com'))).toHaveLength(4);
  });

  it('skips disabled Posts and their status, and Refresh requests fresh enabled Posts', async () => {
    const mock = sourceMock([hit('one')]); vi.stubGlobal('fetch', mock);
    const filters = createDefaultFilters();
    const disabled = await fetchSection('today', {}, { allFilters: filters, todayMix: { ...postsOnly, code: 1, posts: 0 } });
    expect(disabled.status.sources.posts).toBeUndefined();
    expect(mock.mock.calls.some(([url]) => `${url}`.includes('hn.algolia.com'))).toBe(false);
    const options = { allFilters: filters, todayMix: postsOnly };
    await fetchSection('today', {}, options);
    await fetchSection('today', {}, { ...options, force: true });
    expect(mock.mock.calls.filter(([url]) => `${url}`.includes('hn.algolia.com'))).toHaveLength(4);
  });
});

const reddit = (id, subreddit = 'OpenAI', title = 'Community release') => ({
  id, subreddit, title, permalink: `/r/${subreddit}/comments/${id}/release/`, score: 100, num_comments: 10,
  created_utc: Math.floor(Date.now() / 1000) - 3600, author: 'user', selftext: 'Details', is_self: true,
});
it('merges and deduplicates Reddit with HN and invalidates Posts and Today for subreddit changes', async () => {
  const urls = [];
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    urls.push(String(url));
    if (String(url).includes('reddit.com')) return response({ data: { children: [{data: reddit('abc')}, {data: reddit('abc')}] } });
    return sourceMock([hit('hn')])(url);
  }));
  const filters = createDefaultFilters();
  const options = { allFilters: filters, todayMix: postsOnly, redditCommunities: ['OpenAI'] };
  const posts = await fetchSection('posts', filters.posts, options);
  expect(posts.cards.map((card) => card.id)).toEqual(['reddit:abc', 'hn:hn']);
  expect(posts.status.unavailable).toBe(false);
  expect((await fetchSection('today', {}, options)).cards[0].source).toBe('reddit');
  const changed = {...options, redditCommunities: ['LocalLLaMA']};
  expect((await fetchSection('today', {}, changed)).cached).toBe(false);
  expect(urls.some((url) => url.includes('/r/LocalLLaMA/'))).toBe(true);
});
it('keeps Reddit cards available when HN fails and excludes unsafe or out-of-range Reddit posts', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (String(url).includes('hn.algolia')) throw new Error('offline');
    return response({data: {children: [reddit('abc'), {...reddit('bad'), permalink: '//evil.com'},
      {...reddit('old'), created_utc: 1}, {...reddit('pin'), stickied: true}].map((data) => ({data}))}});
  }));
  const result = await fetchSection('posts', createDefaultFilters().posts);
  expect(result.cards.map((card) => card.id)).toEqual(['reddit:abc']);
  expect(result.status.label).toContain('Hacker News unavailable');
});
it('composes all 40 Today cards from five eight-card lanes', () => {
  const cards = (name) => Array.from({length: 8}, (_, i) => ({id: `${name}:${i}`}));
  const result = composeTodayCards({code: cards('c'), models: cards('m'), datasets: cards('d'), community: cards('p'), arxiv: cards('a'), posts: cards('r')},
    {code: 8, models: 8, datasets: 8, papers: 8, posts: 8});
  expect(result.cards).toHaveLength(40); expect(result.shortfalls).toEqual({});
});
