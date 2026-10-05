import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { composeTodayCards, DESCRIPTION_REVISION, fetchSection } from '../src/services/feeds.js';
import { setCache } from '../src/services/storage.js';
import { createDefaultFilters } from '../src/workbenches.js';

const trendingHtml = await readFile(resolve(process.cwd(), 'tests', 'fixtures', 'github-trending.html'), 'utf8');
const arxivXml = await readFile(resolve(process.cwd(), 'tests', 'fixtures', 'arxiv.xml'), 'utf8');

const response = (body, { status = 200, type = 'application/json' } = {}) => new Response(
  type === 'application/json' ? JSON.stringify(body) : body,
  { status, headers: { 'content-type': type } },
);

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('feed integration', () => {
  it('reuses an exact query for six hours and refreshes it after expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-29T00:00:00Z'));
    const fetchMock = vi.fn().mockResolvedValue(response(trendingHtml, { type: 'text/html' }));
    vi.stubGlobal('fetch', fetchMock);
    const filters = createDefaultFilters().code;

    await fetchSection('code', filters);
    vi.advanceTimersByTime((6 * 60 * 60 * 1000) - 1);
    const cached = await fetchSection('code', filters);
    vi.advanceTimersByTime(2);
    const refreshed = await fetchSection('code', filters);

    expect(cached.cached).toBe(true);
    expect(refreshed.cached).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps differently parameterized queries in independent cache entries', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(trendingHtml, { type: 'text/html' }));
    vi.stubGlobal('fetch', fetchMock);
    const defaults = createDefaultFilters().code;

    await fetchSection('code', defaults);
    await fetchSection('code', { ...defaults, language: 'python' });
    const original = await fetchSection('code', defaults);

    expect(original.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('loads parseable GitHub Trending cards with live source metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(trendingHtml, { type: 'text/html' }));
    vi.stubGlobal('fetch', fetchMock);
    const filters = createDefaultFilters().code;

    const first = await fetchSection('code', filters, { force: true });
    const second = await fetchSection('code', filters);

    expect(first.cards).toHaveLength(2);
    expect(first.status).toMatchObject({
      label: 'GitHub Trending',
      sourceUrl: 'https://github.com/trending?since=daily',
      updatedAt: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(first.status.updatedAt))).toBe(false);
    expect(second.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fills a missing Trending description from the repository README', async () => {
    const withoutDescription = trendingHtml.replace(
      '<p class="col-9 color-fg-muted my-1 pr-4">A useful toolkit for building reliable AI agents.</p>',
      '',
    );
    const fetchMock = vi.fn(async (url) => `${url}`.includes('github.com/trending')
      ? response(withoutDescription, { type: 'text/html' })
      : response('<article class="markdown-body"><p>A README description for the agent toolkit.</p></article>', { type: 'text/html' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchSection('code', createDefaultFilters().code, { force: true });

    expect(result.cards[0]).toMatchObject({
      summary: 'A README description for the agent toolkit.',
      details: { descriptionSource: 'readme' },
    });
    expect(fetchMock.mock.calls.map(([url]) => `${url}`)).toContain('https://github.com/example-labs/agent-kit');
  });

  it('returns no repository cards and never calls Search when Trending parsing fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response('<html><body>changed</body></html>', { type: 'text/html' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchSection('code', createDefaultFilters().code, { force: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(`${fetchMock.mock.calls[0][0]}`).toContain('github.com/trending');
    expect(result.cards).toEqual([]);
    expect(result.status).toMatchObject({
      label: 'GitHub Trending is unavailable',
      unavailable: true,
      stale: false,
    });
    expect(result.status.sourceUrl).toBe('https://github.com/trending?since=daily');
  });

  it('does not show stale Code data after a failed live request', async () => {
    const filters = createDefaultFilters().code;
    setCache(
      { section: 'code', filters },
      [{ id: 'github:old/search-result', title: 'old/search-result' }],
      -1,
      { status: { label: 'GitHub search fallback', stale: true } },
    );
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchSection('code', filters, { force: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.cards).toEqual([]);
    expect(result.cached).toBe(false);
    expect(result.status.unavailable).toBe(true);
  });

  it('does not reuse a pre-parity Code cache entry', async () => {
    const filters = createDefaultFilters().code;
    setCache(
      { section: 'code', filters },
      [{ id: 'github:old/search-result', title: 'old/search-result' }],
      60_000,
      { status: { label: 'GitHub search fallback', stale: true } },
    );
    const fetchMock = vi.fn().mockResolvedValue(response(trendingHtml, { type: 'text/html' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchSection('code', filters);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.cached).toBe(false);
    expect(result.cards[0].title).toBe('example-labs/agent-kit');
  });

  it('deduplicates simultaneous matching source requests', async () => {
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const fetchMock = vi.fn(async (url) => {
      if (`${url}`.includes('/api/models')) {
        await pending;
        return response([{ id: 'owner/model', downloads: 10, likes: 2, tags: [] }]);
      }
      return response('# Model\n\nA useful model README.', { type: 'text/markdown' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const filters = createDefaultFilters().models;

    const first = fetchSection('models', filters, { force: true });
    const second = fetchSection('models', filters, { force: true });
    release();
    const results = await Promise.all([first, second]);

    expect(fetchMock.mock.calls.filter(([url]) => `${url}`.includes('/api/models'))).toHaveLength(1);
    expect(results[0].cards).toEqual(results[1].cards);
  });

  it('uses a model README description and reuses its independent item cache', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (`${url}`.includes('/api/models')) {
        return response([{ id: 'owner/model', downloads: 10, likes: 2, trendingScore: 3, tags: [] }]);
      }
      return response('# Model\n\nA source model card for dependable planning.', { type: 'text/markdown' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const filters = createDefaultFilters().models;

    const first = await fetchSection('models', filters, { force: true });
    const second = await fetchSection('models', filters, { force: true });

    expect(first.cards[0]).toMatchObject({
      summary: 'A source model card for dependable planning.',
      details: { descriptionSource: 'readme' },
    });
    expect(second.cards[0].summary).toBe(first.cards[0].summary);
    expect(fetchMock.mock.calls.filter(([url]) => `${url}`.endsWith('/raw/main/README.md'))).toHaveLength(1);
  });

  it('loads model, dataset, community paper, and arXiv workbenches', async () => {
    const fetchMock = vi.fn(async (url) => {
      const value = `${url}`;
      if (value.includes('/api/models')) return response([{ id: 'owner/model', downloads: 10, likes: 2, trendingScore: 3, tags: [] }]);
      if (value.includes('/api/datasets')) return response([{ id: 'owner/dataset', downloads: 20, likes: 4, trendingScore: 5, tags: [] }]);
      if (value.includes('/api/daily_papers')) return response([{ paper: { id: '2608.10000', title: 'Paper', summary: 'Summary', upvotes: 6, authors: [] }, numComments: 1 }]);
      if (value.includes('export.arxiv.org') || value.includes('/__scout/arxiv')) return response(arxivXml, { type: 'application/atom+xml' });
      throw new Error(`Unexpected URL: ${value}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const filters = createDefaultFilters();

    const model = await fetchSection('models', filters.models, { force: true });
    const dataset = await fetchSection('datasets', filters.datasets, { force: true });
    const community = await fetchSection('papers', filters.papers, { force: true });
    const arxiv = await fetchSection('papers', { ...filters.papers, source: 'arxiv', sort: 'newest' }, { force: true });

    expect(model.cards[0].type).toBe('Model');
    expect(dataset.cards[0].type).toBe('Dataset');
    expect(community.cards[0]).toMatchObject({ type: 'Paper', source: 'huggingface' });
    expect(arxiv.cards[0]).toMatchObject({ type: 'Paper', source: 'arxiv' });
  });

  it('uses an expired matching cache when a source request fails', async () => {
    const filters = createDefaultFilters().models;
    const query = { section: 'models', filters, descriptionRevision: DESCRIPTION_REVISION };
    setCache(query, [{ id: 'saved:model', type: 'Model' }], -1, { status: { label: 'Saved models', stale: false } });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await fetchSection('models', filters, { force: true });

    expect(result.cards).toEqual([{ id: 'saved:model', type: 'Model' }]);
    expect(result.status).toMatchObject({ label: 'Saved models', stale: true });
    expect(result.error).toBe('offline');
  });

  it('shows a safe source fallback when no cache exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await fetchSection('datasets', createDefaultFilters().datasets, { force: true });

    expect(result.cards[0].url).toBe('https://huggingface.co/datasets');
    expect(result.status).toMatchObject({ label: 'Datasets fallback', stale: true });
  });

  it('keeps a valid empty filtered result distinct from a source failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([])));

    const result = await fetchSection('datasets', createDefaultFilters().datasets, { force: true });

    expect(result.cards).toEqual([]);
    expect(result.status).toEqual({ label: 'Hugging Face datasets', stale: false });
  });

  it('assembles Today from the five live source requests despite different response shapes', async () => {
    const fetchMock = vi.fn(async (url) => {
      const value = `${url}`;
      if (value.includes('github.com/trending')) return response(trendingHtml, { type: 'text/html' });
      if (value.includes('/api/models')) return response([{ id: 'owner/model', downloads: 10, likes: 2, trendingScore: 3, tags: [] }]);
      if (value.includes('/api/datasets')) return response([{ id: 'owner/dataset', downloads: 20, likes: 4, trendingScore: 5, tags: [] }]);
      if (value.includes('/api/daily_papers')) return response([{ paper: { id: '2608.10000', title: 'Paper', summary: 'Summary', upvotes: 6, authors: [] }, numComments: 1 }]);
      if (value.includes('export.arxiv.org') || value.includes('/__scout/arxiv')) return response(arxivXml, { type: 'application/atom+xml' });
      throw new Error(`Unexpected URL: ${value}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const filters = createDefaultFilters();

    const result = await fetchSection('today', filters.today, {
      force: true,
      allFilters: filters,
    });

    expect(result.cards).toHaveLength(6);
    expect(result.cards.map((card) => card.type)).toEqual(['Code', 'Code', 'Model', 'Dataset', 'Paper', 'Paper']);
    expect(result.status).toMatchObject({ label: 'All sources live', stale: false });
  });

  it('ignores legacy Code topics and preserves GitHub Trending order in Today', async () => {
    const fetchMock = vi.fn(async (url) => {
      const value = `${url}`;
      if (value.includes('github.com/trending')) return response(trendingHtml, { type: 'text/html' });
      if (value.includes('/api/models')) return response([{ id: 'owner/model', downloads: 10, likes: 2, trendingScore: 3, tags: [] }]);
      if (value.includes('/api/datasets')) return response([{ id: 'owner/dataset', downloads: 20, likes: 4, trendingScore: 5, tags: [] }]);
      if (value.includes('/api/daily_papers')) return response([{ paper: { id: '2608.10000', title: 'Paper', summary: 'Summary', upvotes: 6, authors: [] }, numComments: 1 }]);
      if (value.includes('export.arxiv.org') || value.includes('/__scout/arxiv')) return response(arxivXml, { type: 'application/atom+xml' });
      throw new Error(`Unexpected URL: ${value}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const filters = createDefaultFilters();
    filters.code = { ...filters.code, topic: 'evaluation' };

    const result = await fetchSection('today', { topic: 'multimodal' }, {
      force: true, allFilters: filters,
    });

    expect(result.cards.map(({ title }) => title)).toEqual(expect.arrayContaining([
      'example-labs/agent-kit', 'signal-org/eval-workbench', 'owner/model', 'owner/dataset',
    ]));
  });

  it('composes custom Today lanes, alternates papers, and replaces hidden cards', () => {
    const card = (id, type) => ({ id, type });
    const result = composeTodayCards({
      code: [card('code:one', 'Code'), card('code:two', 'Code'), card('code:three', 'Code')],
      models: [card('model:one', 'Model')],
      datasets: [card('dataset:one', 'Dataset')],
      community: [card('paper:community-one', 'Paper'), card('paper:community-two', 'Paper')],
      arxiv: [card('paper:arxiv-one', 'Paper'), card('paper:arxiv-two', 'Paper')],
    }, {
      code: 2,
      models: 0,
      datasets: 0,
      papers: 4,
    }, {
      'code:one': { hidden: true },
    });

    expect(result.cards.map(({ id }) => id)).toEqual([
      'code:two',
      'code:three',
      'paper:community-one',
      'paper:arxiv-one',
      'paper:community-two',
      'paper:arxiv-two',
    ]);
    expect(result.shortfalls).toEqual({});
  });

  it('reports Today source shortfalls instead of silently substituting another lane', () => {
    const result = composeTodayCards({
      code: [{ id: 'code:one' }],
      models: [],
      datasets: [],
      community: [],
      arxiv: [],
    }, { code: 2, models: 1, datasets: 0, papers: 0 }, {});

    expect(result.cards.map(({ id }) => id)).toEqual(['code:one']);
    expect(result.shortfalls).toEqual({ code: 1, models: 1 });
  });
});

describe('Reddit posts feed', () => {
  const listing = (children) => ({ data: { children: children.map((data) => ({ kind: 't3', data })) } });
  const redditPost = (id, extra = {}) => ({
    name: `t3_${id}`, title: `Post ${id}`, permalink: `/r/LocalLLaMA/comments/${id}/p/`, score: 10,
    num_comments: 2, subreddit: 'LocalLLaMA', is_self: true, ...extra,
  });

  it('requests the configured subreddits without credentials and skips unusable posts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(listing([
      redditPost('a'), redditPost('b', { stickied: true }), redditPost('c', { over_18: true }),
    ])));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchSection('posts', createDefaultFilters().posts, {
      force: true, redditCommunities: ['LocalLLaMA', 'OpenAI'],
    });

    expect(fetchMock.mock.calls[0][0]).toContain('/r/LocalLLaMA+OpenAI/top.json');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'omit' });
    expect(result.cards.map(({ id }) => id)).toEqual(['reddit:t3_a']);
    expect(result.status.label).toBe('Reddit');
  });

  it('keeps cache entries separate per configured subreddit list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(listing([redditPost('a')])));
    vi.stubGlobal('fetch', fetchMock);
    const filters = createDefaultFilters().posts;

    await fetchSection('posts', filters, { redditCommunities: ['LocalLLaMA'] });
    const again = await fetchSection('posts', filters, { redditCommunities: ['LocalLLaMA'] });
    await fetchSection('posts', filters, { redditCommunities: ['OpenAI'] });

    expect(again.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows a Reddit-specific fallback card when Reddit blocks the request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('blocked', { status: 403, type: 'text/html' })));

    const result = await fetchSection('posts', createDefaultFilters().posts, {
      force: true, redditCommunities: ['LocalLLaMA'],
    });

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toMatchObject({ source: 'reddit', id: 'fallback:reddit:ai' });
    expect(result.status.stale).toBe(true);
  });
});
