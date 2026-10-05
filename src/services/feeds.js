import { getWorkbench } from '../workbenches.js';
import {
  buildArxivRequest,
  buildCommunityPapersUrl,
  buildDatasetsRequest,
  buildGithubRequest,
  buildPostsUrl,
  buildRedditPostsUrl,
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
  isUsableRedditPost,
  normalizePost,
  normalizeRedditPost,
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

const redditFallbackCards = [{
  id: 'fallback:reddit:ai', source: 'reddit', section: 'posts', type: 'Post',
  title: 'AI communities on Reddit', url: 'https://www.reddit.com/r/LocalLLaMA/',
  summary: 'Open r/LocalLLaMA while the live Reddit feed is unavailable. Reddit may be rate limiting or requiring a sign-in.',
  tags: ['AI', 'Reddit'], metricLabel: 'Source', metricValue: 'Reddit',
  metrics: [], links: [], secondary: { left: 'Community posts', right: 'Live feed unavailable' }, details: {},
}];

const fallbackFor = (section, filters) => (
  section === 'posts' && filters.source !== 'hackernews' ? redditFallbackCards : fallbackCards[section] || []
);

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

const fetchRedditPosts = async (filters, options) => {
  const data = await fetchJson(buildRedditPostsUrl(filters, options.redditCommunities), { credentials: 'omit' });
  if (!Array.isArray(data?.data?.children)) throw new Error('Reddit returned an unexpected response');
  const cards = data.data.children.map((child) => child?.data).filter(isUsableRedditPost)
    .map(normalizeRedditPost)
    .filter((card) => card.url && matchesTopic(card, filters.topic))
    .slice(0, 24);
  return { cards, status: { label: 'Reddit', stale: false } };
};

const fetchPosts = async (filters, options = {}) => {
  if (filters.source !== 'hackernews') return fetchRedditPosts(filters, options);
  const data = await fetchJson(buildPostsUrl(filters));
  if (!Array.isArray(data?.hits)) throw new Error('Hacker News search returned an unexpected response');
  const cards = data.hits.filter((hit) => hit.title && hit.objectID).map((hit) => normalizePost(hit))
    .filter((card) => isAiPost(card) && matchesTopic(card, filters.topic))
    .sort((left, right) => right.details.points - left.details.points)
    .slice(0, 24);
  return { cards, status: { label: 'Hacker News', stale: false } };
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
  };
  const shortfalls = Object.fromEntries(Object.entries(selected)
    .filter(([lane, cards]) => cards.length < mix[lane])
    .map(([lane, cards]) => [lane, mix[lane] - cards.length]));
  return {
    cards: ['code', 'models', 'datasets', 'papers'].flatMap((lane) => selected[lane]),
    shortfalls,
  };
};

const fetchToday = async (_filters, options) => {
  const allFilters = options.allFilters || {};
  const sourceFilters = {
    code: { ...getWorkbench('code').defaults, ...allFilters.code },
    models: { ...getWorkbench('models').defaults, ...allFilters.models },
    datasets: { ...getWorkbench('datasets').defaults, ...allFilters.datasets },
    community: { ...getWorkbench('papers').defaults, ...allFilters.papers, source: 'community' },
    arxiv: { ...getWorkbench('papers').defaults, ...allFilters.papers, source: 'arxiv', sort: 'newest' },
  };
  const sharedOptions = { ...options, force: false };
  const [code, models, datasets, community, arxiv] = await Promise.all([
    fetchSection('code', sourceFilters.code, sharedOptions),
    fetchSection('models', sourceFilters.models, sharedOptions),
    fetchSection('datasets', sourceFilters.datasets, sharedOptions),
    fetchSection('papers', sourceFilters.community, sharedOptions),
    fetchSection('papers', sourceFilters.arxiv, sharedOptions),
  ]);
  const results = [code, models, datasets, community, arxiv];
  const composition = composeTodayCards({
    code: code.cards,
    models: models.cards,
    datasets: datasets.cards,
    community: community.cards,
    arxiv: arxiv.cards,
  }, options.todayMix, options.userState);
  const missing = Object.entries(composition.shortfalls)
    .map(([lane, count]) => `${count} ${lane}`)
    .join(', ');

  const unavailable = results.some((result) => result.status.unavailable);
  const stale = results.some((result) => result.status.stale);

  return {
    cards: composition.cards,
    status: {
      label: unavailable ? 'Some sources unavailable' : stale ? 'Mixed live and fallback sources' : 'All sources live',
      stale,
      unavailable,
      ...(missing ? { message: `Today could not fill: ${missing}.` } : {}),
      sources: Object.fromEntries(['code', 'models', 'datasets', 'communityPapers', 'arxiv']
        .map((id, index) => [id, results[index].status])),
    },
  };
};

export const fetchSection = async (section, filters, options = {}) => {
  const normalizedOptions = {
    force: false,
    todayMix: { code: 2, models: 1, datasets: 1, papers: 2 },
    redditCommunities: [],
    userState: {},
    ...options,
  };
  const hiddenIds = section === 'today'
    ? Object.entries(normalizedOptions.userState).filter(([, value]) => value.hidden).map(([id]) => id).sort()
    : [];
  const query = {
    section,
    filters,
    ...(['code', 'today'].includes(section) ? { sourceRevision: GITHUB_TRENDING_SOURCE_REVISION } : {}),
    ...(['models', 'today'].includes(section) ? { descriptionRevision: DESCRIPTION_REVISION } : {}),
    ...(section === 'posts' && filters.source !== 'hackernews'
      ? { communities: normalizedOptions.redditCommunities } : {}),
    ...(section === 'today' ? { todayMix: normalizedOptions.todayMix, hiddenIds } : {}),
  };
  const key = stableSerialize(query);

  if (!normalizedOptions.force) {
    const cached = getCache(query);
    if (isUsableCache(section, cached)) {
      return { cards: cached.cards, status: cached.status, cached: true };
    }
  }

  return deduplicate(key, async () => {
    try {
      const result = section === 'today'
        ? await fetchToday(filters, normalizedOptions)
        : await liveFetcher(section, filters, normalizedOptions);
      setCache(query, result.cards, getWorkbench(section).cacheTtl, { status: result.status });
      return { ...result, cached: false };
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
        cards: fallbackFor(section, filters),
        status: { label: `${getWorkbench(section).label} fallback`, stale: true, message: error.message },
        cached: false,
        error: error.message,
      };
    }
  });
};
