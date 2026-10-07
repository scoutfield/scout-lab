import { fetchBrightDataReddit, getBrightDataSettings } from './brightData.js';
import { getWorkbench, normalizeWorkbenchFilters, POSTS_CACHE_TTL } from '../workbenches.js';
import { DEFAULT_TODAY_MIX, normalizeTodayMix, normalizeRedditCommunities } from '../settings.js';
import {
  buildArxivRequest,
  buildCommunityPapersUrl,
  buildDatasetsRequest,
  buildGithubRequest,
  buildPostsUrl,
  POST_RANGE_DAYS,
  POSTS_PAGE_SIZE,
  buildModelsUrl,
  matchesTopic,
  resolveGithubRequestUrl,
  resolveArxivRequestUrl,
  resolveDatasetsRequestUrl,
  stableSerialize,
} from './query.js';
import {
  normalizeCommunityPaper,
  normalizeDataset,
  normalizeModel,
  filterModelsByUpdated,
  isAiPost,
  matchesPostTopic,
  normalizePost,
  groupModelCards,
  parseArxivFeed,
  parseGithubTrending,
  parseHuggingFaceDatasetsPage,
} from './normalizers.js';
import { DESCRIPTION_REVISION, enrichCardDescriptions } from './descriptions.js';
import { getCache, getStaleCache, setCache } from './storage.js';

const REQUEST_TIMEOUT = 10_000;
const pendingRequests = new Map();
export const GITHUB_TRENDING_SOURCE_REVISION = 'github-trending-v4';
export const POSTS_SOURCE_REVISION = 'unified-posts-v4';
export { DESCRIPTION_REVISION };

const fallbackCards = {
  models: [{
    id: 'fallback:hf:models', source: 'huggingface', section: 'models', type: 'Model',
    title: 'Hugging Face models', url: 'https://huggingface.co/models',
    summary: 'Browse open models by task, library, downloads, and community activity.',
    tags: ['models', 'weights', 'huggingface'], metricLabel: 'Source', metricValue: 'HF Hub',
    metrics: [], links: [], secondary: { left: 'Model catalog', right: 'Live feed unavailable' }, details: {},
  }],
  datasets: [{
    id: 'fallback:hf:datasets', source: 'huggingface', section: 'datasets', type: 'Dataset',
    title: 'Hugging Face datasets', url: 'https://huggingface.co/datasets',
    summary: 'Browse datasets that reveal training tasks, evaluation styles, and problem framing.',
    tags: ['datasets', 'evaluation', 'huggingface'], metricLabel: 'Source', metricValue: 'HF Hub',
    metrics: [], links: [], secondary: { left: 'Dataset catalog', right: 'Live feed unavailable' }, details: {},
  }],
  papers: [{
    id: 'fallback:arxiv:ai', source: 'arxiv', section: 'papers', type: 'Paper',
    title: 'Recent arXiv AI and ML papers', url: 'https://arxiv.org/list/cs.AI/recent',
    summary: 'Scan recent cs.AI and cs.LG research while the selected live feed is unavailable.',
    tags: ['research', 'cs.AI', 'cs.LG'], metricLabel: 'Source', metricValue: 'arXiv',
    metrics: [], links: [], secondary: { left: 'Raw research', right: 'Live feed unavailable' }, details: {},
  }],
};

fallbackCards.posts = [{
  id: 'fallback:hn:ai', source: 'hackernews', section: 'posts', type: 'Post',
  title: 'AI posts on Hacker News', url: 'https://news.ycombinator.com/',
  summary: 'Browse the Hacker News front page for AI discussions while the live feed is unavailable.',
  tags: ['AI', 'Hacker News'], metricLabel: 'Source', metricValue: 'Hacker News',
  metrics: [], links: [], secondary: { left: 'Community posts', right: 'Live feed unavailable' }, details: {},
}];

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed with ${response.status}`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
};

const fetchJson = async (url, options = {}) => (await fetchWithTimeout(url, {
  ...options,
  headers: { Accept: 'application/json', ...(options.headers || {}) },
})).json();

const fetchText = async (url, options = {}) => (await fetchWithTimeout(url, options)).text();

const ensureTrendingCards = (cards) => {
  if (cards.length) return cards;
  throw new Error('GitHub Trending markup did not contain repository cards');
};

const deduplicate = (key, task) => {
  if (pendingRequests.has(key)) return pendingRequests.get(key);
  const request = task().finally(() => pendingRequests.delete(key));
  pendingRequests.set(key, request);
  return request;
};

const fetchCode = async (filters) => {
  const request = buildGithubRequest(filters);
  const html = await fetchText(resolveGithubRequestUrl(request), { headers: { Accept: 'text/html' } });
  const parsed = ensureTrendingCards(parseGithubTrending(html, filters.time));
  const cards = await enrichCardDescriptions(parsed);
  return {
    cards,
    status: {
      label: 'GitHub Trending',
      stale: false,
      unavailable: false,
      sourceRevision: GITHUB_TRENDING_SOURCE_REVISION,
      sourceUrl: request.url,
      updatedAt: new Date().toISOString(),
    },
  };
};

const fetchModels = async (filters) => {
  const data = await fetchJson(buildModelsUrl(filters));
  if (!Array.isArray(data)) throw new Error('Hugging Face models returned an unexpected response');
  const normalized = data.map((item) => normalizeModel(item, filters.rank));
  const grouped = groupModelCards(filterModelsByUpdated(normalized, filters.updated)
    .filter((card) => matchesTopic(card, filters.topic))).slice(0, 24);
  const cards = await enrichCardDescriptions(grouped);
  return {
    cards,
    status: { label: 'Hugging Face models', stale: false, descriptionRevision: DESCRIPTION_REVISION },
  };
};

const fetchDatasets = async (filters) => {
  const request = buildDatasetsRequest(filters);
  const requestUrl = resolveDatasetsRequestUrl(request);
  const data = request.kind === 'page'
    ? parseHuggingFaceDatasetsPage(await fetchText(requestUrl, { headers: { Accept: 'text/html' } }))
    : await fetchJson(requestUrl);
  if (!Array.isArray(data)) throw new Error('Hugging Face datasets returned an unexpected response');
  const cards = data.map((item) => normalizeDataset(item, filters.rank))
    .filter((card) => matchesTopic(card, filters.topic)).slice(0, 24);
  return { cards, status: { label: 'Hugging Face datasets', stale: false } };
};

const POSTS_MAX_PAGES = 5;

const fetchPostPool = async (filters, now, order) => {
  const hits = [];
  let limited = false;
  for (let page = 0; page < POSTS_MAX_PAGES; page += 1) {
    const data = await fetchJson(buildPostsUrl(filters, now, { order, page }));
    if (!Array.isArray(data?.hits)) throw new Error('Hacker News search returned an unexpected response');
    hits.push(...data.hits);
    limited = Number(data.nbHits) > POSTS_MAX_PAGES * POSTS_PAGE_SIZE;
    if (data.hits.length < POSTS_PAGE_SIZE || page + 1 >= Number(data.nbPages)) break;
  }
  return { hits, limited };
};

const fetchHackerNewsPosts = async (filters, now) => {
  const pools = await Promise.all(['points', 'recent'].map((order) => fetchPostPool(filters, now, order)));
  const hits = [...new Map(pools.flatMap((pool) => pool.hits)
    .filter((hit) => hit.title && hit.objectID).map((hit) => [`${hit.objectID}`, hit])).values()];
  return { cards: hits.map((hit) => normalizePost(hit, now.getTime())).filter(isAiPost),
    candidates: hits.length, limited: pools.some((pool) => pool.limited) };
};

const fetchPosts = async (filters, options) => {
  const now = new Date();
  const sources = ['Hacker News', 'Reddit'];
  const results = await Promise.allSettled([
    fetchHackerNewsPosts(filters, now), fetchBrightDataReddit(options.redditCommunities),
  ]);
  const successful = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  if (!successful.length) throw new Error('Hacker News and Reddit could not be loaded.');
  const failed = results.flatMap((result, index) => result.status === 'rejected' ? [sources[index]] : []);
  const cutoff = now.getTime() - (POST_RANGE_DAYS[filters.time] || 7) * 86400_000;
  const cards = successful.flatMap((result) => result.cards)
    .filter((card) => Date.parse(card.publishedAt) > cutoff && Date.parse(card.publishedAt) <= now.getTime()
      && card.details.points >= Number(filters.minPoints) && card.details.comments >= Number(filters.minComments)
      && matchesPostTopic(card, filters.topic))
    .sort((left, right) => right.details.hotScore - left.details.hotScore
      || right.details.points - left.details.points
      || Date.parse(right.publishedAt) - Date.parse(left.publishedAt) || left.id.localeCompare(right.id));
  const reddit = results[1].status === 'fulfilled' ? results[1].value : null;
  const redditMessage = results[1].status === 'rejected' ? results[1].reason.message : reddit?.message;
  return { cards, cacheTtl: reddit?.pending ? 15_000 : POSTS_CACHE_TTL, status: {
    redditPending: Boolean(reddit?.pending),
    label: failed.length ? `${sources.filter((name) => !failed.includes(name)).join(' · ')} · ${failed.join(' · ')} unavailable` : 'Hacker News · Reddit',
    stale: false, unavailable: failed.length > 0 || Boolean(reddit?.unavailable), sourceRevision: POSTS_SOURCE_REVISION,
    ...(redditMessage ? { message: redditMessage } : failed.length ? { message: `${failed.join(' and ')} could not be loaded. Showing available posts.` } : {}),
    updatedAt: now.toISOString(), candidates: successful.reduce((sum, result) => sum + result.candidates, 0),
    limited: successful.some((result) => result.limited),
  } };
};

const fetchPapers = async (filters) => {
  if (filters.source === 'arxiv') {
    const request = buildArxivRequest(filters);
    const xml = await fetchText(resolveArxivRequestUrl(request), { headers: { Accept: 'application/atom+xml' } });
    return {
      cards: parseArxivFeed(xml),
      status: { label: 'Raw arXiv', stale: false },
    };
  }

  const data = await fetchJson(buildCommunityPapersUrl(filters));
  if (!Array.isArray(data)) throw new Error('Hugging Face Daily Papers returned an unexpected response');
  const cards = data.map(normalizeCommunityPaper)
    .filter((card) => matchesTopic(card, filters.topic))
    .sort((left, right) => filters.sort === 'recent'
      ? new Date(right.details.featuredAt).getTime() - new Date(left.details.featuredAt).getTime()
      : right.details.upvotes - left.details.upvotes)
    .slice(0, 24);
  return { cards, status: { label: 'Hugging Face Daily Papers', stale: false } };
};

const liveFetcher = (section, filters, options) => {
  if (section === 'code') return fetchCode(filters);
  if (section === 'models') return fetchModels(filters);
  if (section === 'datasets') return fetchDatasets(filters);
  if (section === 'papers') return fetchPapers(filters);
  if (section === 'posts') return fetchPosts(filters, options);
  throw new Error(`Unknown workbench: ${section}`);
};

const visibleLane = (cards = [], userState = {}) => cards.filter((card) => !userState[card.id]?.hidden);

const isUsableCache = (section, cached) => (
  cached && (section !== 'code' || (Array.isArray(cached.cards) && cached.cards.length > 0))
);

const alternatePapers = (community, arxiv, count) => {
  const cards = [];
  for (let index = 0; cards.length < count && (community[index] || arxiv[index]); index += 1) {
    if (community[index]) cards.push(community[index]);
    if (cards.length < count && arxiv[index]) cards.push(arxiv[index]);
  }
  return cards;
};

export const composeTodayCards = (lanes, mix, userState = {}) => {
  const selected = {
    code: visibleLane(lanes.code, userState).slice(0, mix.code),
    models: visibleLane(lanes.models, userState).slice(0, mix.models),
    datasets: visibleLane(lanes.datasets, userState).slice(0, mix.datasets),
    papers: alternatePapers(
      visibleLane(lanes.community, userState),
      visibleLane(lanes.arxiv, userState),
      mix.papers,
    ),
    posts: visibleLane(lanes.posts, userState).slice(0, mix.posts || 0),
  };
  const shortfalls = Object.fromEntries(Object.entries(selected)
    .filter(([lane, cards]) => cards.length < mix[lane])
    .map(([lane, cards]) => [lane, mix[lane] - cards.length]));
  return {
    cards: ['code', 'models', 'datasets', 'papers', 'posts'].flatMap((lane) => selected[lane]),
    shortfalls,
  };
};

const todaySourceFilters = (allFilters = {}) => ({
  code: { ...getWorkbench('code').defaults, ...allFilters.code },
  models: { ...getWorkbench('models').defaults, ...allFilters.models },
  datasets: { ...getWorkbench('datasets').defaults, ...allFilters.datasets },
  community: { ...getWorkbench('papers').defaults, ...allFilters.papers, source: 'community' },
  arxiv: { ...getWorkbench('papers').defaults, ...allFilters.papers, source: 'arxiv', sort: 'newest' },
  posts: normalizeWorkbenchFilters('posts', allFilters.posts),
});

const fetchToday = async (_filters, options) => {
  const sourceFilters = todaySourceFilters(options.allFilters);
  const sharedOptions = { ...options, force: false };
  const postsEnabled = options.todayMix.posts > 0;
  const [code, models, datasets, community, arxiv, posts] = await Promise.all([
    fetchSection('code', sourceFilters.code, sharedOptions),
    fetchSection('models', sourceFilters.models, sharedOptions),
    fetchSection('datasets', sourceFilters.datasets, sharedOptions),
    fetchSection('papers', sourceFilters.community, sharedOptions),
    fetchSection('papers', sourceFilters.arxiv, sharedOptions),
    postsEnabled ? fetchSection('posts', sourceFilters.posts, { ...sharedOptions, force: options.force }) : null,
  ]);
  const results = [code, models, datasets, community, arxiv, ...(postsEnabled ? [posts] : [])];
  const composition = composeTodayCards({
    code: code.cards,
    models: models.cards,
    datasets: datasets.cards,
    community: community.cards,
    arxiv: arxiv.cards,
    posts: posts?.cards || [],
  }, options.todayMix, options.userState);
  const missing = Object.entries(composition.shortfalls)
    .map(([lane, count]) => `${count} ${lane}`)
    .join(', ');

  const unavailable = results.some((result) => result.status.unavailable);
  const stale = results.some((result) => result.status.stale);

  return {
    cards: composition.cards,
    // A Today cache must expire with its Posts source cache, not restart its lifetime.
    cacheTtl: postsEnabled
      ? Math.max(0, Math.min(POSTS_CACHE_TTL, (posts.cacheExpiresAt || Date.now() + POSTS_CACHE_TTL) - Date.now()))
      : getWorkbench('today').cacheTtl,
    status: {
      label: unavailable ? 'Some sources unavailable' : stale ? 'Mixed live and fallback sources' : 'All sources live',
      stale,
      unavailable,
      redditPending: Boolean(posts?.status.redditPending),
      ...(missing ? { message: `Today could not fill: ${missing}.` } : {}),
      sources: Object.fromEntries(['code', 'models', 'datasets', 'communityPapers', 'arxiv', ...(postsEnabled ? ['posts'] : [])]
        .map((id, index) => [id, results[index].status])),
    },
  };
};

export const fetchSection = async (section, filters, options = {}) => {
  if (section === 'posts') filters = normalizeWorkbenchFilters('posts', filters);
  const normalizedOptions = {
    force: false,
    todayMix: DEFAULT_TODAY_MIX,
    userState: {},
    ...options,
  };
  normalizedOptions.redditCommunities = normalizeRedditCommunities(normalizedOptions.redditCommunities);
  normalizedOptions.todayMix = normalizeTodayMix(normalizedOptions.todayMix);
  const hiddenIds = section === 'today'
    ? Object.entries(normalizedOptions.userState).filter(([, value]) => value.hidden).map(([id]) => id).sort()
    : [];
  const query = {
    section,
    filters,
    ...((section === 'posts' || (section === 'today' && normalizedOptions.todayMix.posts > 0)) ? { redditCommunities: normalizedOptions.redditCommunities, brightDataConnected: getBrightDataSettings().connected } : {}),
    ...(['code', 'today'].includes(section) ? { sourceRevision: GITHUB_TRENDING_SOURCE_REVISION } : {}),
    ...(['models', 'today'].includes(section) ? { descriptionRevision: DESCRIPTION_REVISION } : {}),
    ...(['posts', 'today'].includes(section) ? { postsRevision: POSTS_SOURCE_REVISION } : {}),
    ...(section === 'today' ? {
      todayMix: normalizedOptions.todayMix, hiddenIds,
      sourceFilters: {
        ...todaySourceFilters(normalizedOptions.allFilters),
        // Ignore disabled Posts filters in the queue's cache identity.
        posts: normalizedOptions.todayMix.posts > 0 ? todaySourceFilters(normalizedOptions.allFilters).posts : null,
      },
    } : {}),
  };
  const key = stableSerialize(query);

  if (!normalizedOptions.force) {
    const cached = getCache(query);
    if (isUsableCache(section, cached)) {
      return { cards: cached.cards, status: cached.status, cached: true, cacheExpiresAt: cached.expiresAt };
    }
  }

  return deduplicate(key, async () => {
    try {
      const result = section === 'today'
        ? await fetchToday(filters, normalizedOptions)
        : await liveFetcher(section, filters, normalizedOptions);
      const entry = setCache(query, result.cards, result.cacheTtl ?? getWorkbench(section).cacheTtl, { status: result.status });
      return { ...result, cached: false, cacheExpiresAt: entry.expiresAt };
    } catch (error) {
      if (section === 'code') {
        return {
          cards: [],
          status: {
            label: 'GitHub Trending is unavailable',
            message: 'GitHub Trending could not be loaded.',
            stale: false,
            unavailable: true,
            sourceRevision: GITHUB_TRENDING_SOURCE_REVISION,
            sourceUrl: buildGithubRequest(filters).url,
          },
          cached: false,
          error: error.message,
        };
      }
      const stale = getStaleCache(query);
      if (stale?.cards?.length) {
        return {
          cards: stale.cards,
          status: { ...(stale.status || {}), stale: true, message: `Showing saved results. ${error.message}` },
          cached: true,
          error: error.message,
        };
      }
      return {
        cards: fallbackCards[section] || [],
        status: { label: `${getWorkbench(section).label} fallback`, stale: true, message: error.message },
        cached: false,
        error: error.message,
      };
    }
  });
};
