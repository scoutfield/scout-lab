export const TOPIC_TERMS = {
  all: [],
  agents: ['agent', 'tool-use', 'workflow'],
  llms: ['llm', 'language model', 'transformer'],
  rag: ['rag', 'retrieval', 'embedding'],
  evaluation: ['evaluation', 'benchmark', 'eval'],
  multimodal: ['multimodal', 'vision language', 'diffusion'],
};

const MODEL_SORT = {
  trending: { field: 'trendingScore', direction: '-1' },
  likes: { field: 'likes', direction: '-1' },
  downloads: { field: 'downloads', direction: '-1' },
  newest: { field: 'createdAt', direction: '-1' },
  created: { field: 'createdAt', direction: '-1' },
  updated: { field: 'lastModified', direction: '-1' },
  'most-parameters': { field: 'num_parameters', direction: '-1' },
  'least-parameters': { field: 'num_parameters', direction: '1' },
};

const MODEL_SIZE = {
  'under-1b': 'max:1B',
  '1b-7b': 'min:1B,max:7B',
  '7b-30b': 'min:7B,max:30B',
  '30b-plus': 'min:30B',
};

export const DATASET_SIZE = {
  'under-1k': 'n<1K',
  '1k-10k': '1K<n<10K',
  '10k-100k': '10K<n<100K',
  '100k-1m': '100K<n<1M',
  '1m-10m': '1M<n<10M',
  '10m-100m': '10M<n<100M',
  '100m-1b': '100M<n<1B',
  '1b-10b': '1B<n<10B',
  '10b-100b': '10B<n<100B',
  '100b-1t': '100B<n<1T',
  '1t-plus': 'n>1T',
};

const DATASET_SORT = {
  trending: { field: 'trendingScore', direction: '-1' },
  likes: { field: 'likes', direction: '-1' },
  downloads: { field: 'downloads', direction: '-1' },
  newest: { field: 'createdAt', direction: '-1' },
  created: { field: 'createdAt', direction: '-1' },
  updated: { field: 'lastModified', direction: '-1' },
  'largest-size': { field: 'mainSize', direction: '-1' },
  'smallest-size': { field: 'mainSize', direction: '1' },
};

const DATASET_PAGE_SORT = { 'most-rows': 'most_rows', 'least-rows': 'least_rows' };

const SOURCE_HOSTS = {
  github: new Set(['github.com']),
  huggingface: new Set(['huggingface.co']),
  arxiv: new Set(['arxiv.org', 'export.arxiv.org']),
  reddit: new Set(['www.reddit.com', 'reddit.com', 'old.reddit.com']),
  hackernews: new Set(['news.ycombinator.com']),
  // Outbound article links: any https host, never credentials.
  web: null,
};

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
  );
};

export const stableSerialize = (value) => JSON.stringify(stableValue(value));

const pad = (value) => `${value}`.padStart(2, '0');

const dateKey = (date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
const arxivDateKey = (date) => dateKey(date).replaceAll('-', '');

const subtractDays = (now, days) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

const periodStart = (time, now) => subtractDays(now, time === 'day' ? 1 : time === 'month' ? 30 : 7);

const isoWeek = (input) => {
  const date = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad(week)}`;
};

export const buildGithubRequest = (filters) => {
  const language = filters.language === 'all' ? '' : filters.language;
  const since = { day: 'daily', week: 'weekly', month: 'monthly' }[filters.time] || 'weekly';
  const params = new URLSearchParams({ since });
  if (filters.spokenLanguage && filters.spokenLanguage !== 'all') {
    params.set('spoken_language_code', filters.spokenLanguage);
  }
  const path = language ? `/trending/${encodeURIComponent(language)}` : '/trending';
  const previewParams = new URLSearchParams({ since });
  if (language) previewParams.set('language', language);
  if (filters.spokenLanguage && filters.spokenLanguage !== 'all') {
    previewParams.set('spoken_language_code', filters.spokenLanguage);
  }
  return {
    kind: 'trending',
    url: `https://github.com${path}?${params}`,
    previewUrl: `/__scout/github-trending?${previewParams}`,
  };
};

export const resolveGithubRequestUrl = (request, location = globalThis.location) => {
  const loopback = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
  const isPreview = ['http:', 'https:'].includes(location?.protocol) && loopback.has(location?.hostname);
  return isPreview ? request.previewUrl : request.url;
};

const appendExpand = (params, fields) => fields.forEach((field) => params.append('expand[]', field));

export const buildModelsUrl = (filters) => {
  const sort = MODEL_SORT[filters.rank] || MODEL_SORT.trending;
  const params = new URLSearchParams({
    sort: sort.field,
    direction: sort.direction,
    limit: '48',
  });
  if (filters.task !== 'all') params.set('pipeline_tag', filters.task);
  if (MODEL_SIZE[filters.size]) params.set('num_parameters', MODEL_SIZE[filters.size]);
  if (filters.baseOnly === 'on') params.set('base_model_relation', 'base');
  if (filters.inference === 'on') params.set('inference_provider', 'all');
  if (filters.library && filters.library !== 'all') params.append('filter', filters.library);
  if (filters.license && filters.license !== 'all') params.append('filter', `license:${filters.license}`);
  if (filters.access !== 'all') params.set('gated', `${filters.access === 'gated'}`);
  if (filters.app && filters.app !== 'all') params.set('apps', filters.app);
  appendExpand(params, [
    'downloads', 'likes', 'tags', 'pipeline_tag', 'trendingScore', 'gated',
    'createdAt', 'lastModified', 'safetensors', 'gguf', 'inferenceProviderMapping',
  ]);
  return `https://huggingface.co/api/models?${params}`;
};

const appendDatasetApiFilters = (params, filters) => {
  if (filters.task !== 'all') params.append('filter', `task_categories:${filters.task}`);
  if (DATASET_SIZE[filters.size]) params.append('filter', `size_categories:${DATASET_SIZE[filters.size]}`);
  if (filters.modality && filters.modality !== 'all') params.append('filter', `modality:${filters.modality}`);
  if (filters.format && filters.format !== 'all') params.append('filter', `format:${filters.format}`);
  if (filters.language && filters.language !== 'all') params.append('filter', `language:${filters.language}`);
  if (filters.license && filters.license !== 'all') params.append('filter', `license:${filters.license}`);
  if (filters.access && filters.access !== 'all') params.set('gated', `${filters.access === 'gated'}`);
  if (filters.type === 'benchmark' || filters.benchmark === 'official') params.append('filter', 'benchmark:official');
  if (filters.type === 'traces') params.append('filter', 'format:agent-traces');
};

const buildDatasetsApiUrl = (filters) => {
  const sort = DATASET_SORT[filters.rank] || DATASET_SORT.trending;
  const params = new URLSearchParams({
    sort: sort.field,
    direction: sort.direction,
    limit: '48',
  });
  appendDatasetApiFilters(params, filters);
  appendExpand(params, [
    'downloads', 'likes', 'tags', 'trendingScore', 'createdAt', 'lastModified',
    'description', 'mainSize',
  ]);
  return `https://huggingface.co/api/datasets?${params}`;
};

const buildDatasetsPageParams = (filters) => {
  const params = new URLSearchParams({ sort: DATASET_PAGE_SORT[filters.rank] });
  if (filters.task !== 'all') params.set('task_categories', `task_categories:${filters.task}`);
  if (DATASET_SIZE[filters.size]) params.set('size_categories', `size_categories:${DATASET_SIZE[filters.size]}`);
  if (filters.modality !== 'all') params.set('modality', `modality:${filters.modality}`);
  if (filters.format !== 'all') params.set('format', `format:${filters.format}`);
  if (filters.language !== 'all') params.set('language', `language:${filters.language}`);
  if (filters.license !== 'all') params.set('license', `license:${filters.license}`);
  if (filters.access !== 'all') params.set('gated', `${filters.access === 'gated'}`);
  if (filters.type === 'benchmark') params.set('benchmark', 'benchmark:official');
  if (filters.type === 'traces') params.set('format', 'format:agent-traces');
  return params;
};

export const buildDatasetsRequest = (filters) => {
  if (!DATASET_PAGE_SORT[filters.rank]) return { kind: 'api', url: buildDatasetsApiUrl(filters) };
  const params = buildDatasetsPageParams(filters);
  return {
    kind: 'page',
    url: `https://huggingface.co/datasets?${params}`,
    previewUrl: `/__scout/hf-datasets?${params}`,
  };
};

export const buildDatasetsUrl = (filters) => buildDatasetsRequest(filters).url;

export const resolveDatasetsRequestUrl = (request, location = globalThis.location) => (
  request.kind === 'page' && isLoopbackPreview(location) ? request.previewUrl : request.url
);

export const buildCommunityPapersUrl = (filters, now = new Date()) => {
  const params = new URLSearchParams({
    limit: '100',
  });
  if (filters.time === 'day') params.set('date', dateKey(now));
  if (filters.time === 'week') params.set('week', isoWeek(now));
  if (filters.time === 'month') params.set('month', dateKey(now).slice(0, 7));
  return `https://huggingface.co/api/daily_papers?${params}`;
};

export const POST_RANGE_DAYS = { day: 1, week: 7, month: 30 };
export const POSTS_PAGE_SIZE = 200;

export const buildPostsUrl = (filters, now = new Date(), { order = 'points', page = 0 } = {}) => {
  // Empty-query pools avoid relevance-ranking bias and missing unfamiliar AI titles.
  const params = new URLSearchParams({ tags: 'story', hitsPerPage: `${POSTS_PAGE_SIZE}`, page: `${page}` });
  const seconds = Math.floor(now.getTime() / 1000);
  const days = POST_RANGE_DAYS[filters.time] || 7;
  const threshold = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  params.set('numericFilters', [
    `created_at_i>${seconds - days * 86400}`,
    `points>=${threshold(filters.minPoints)}`,
    `num_comments>=${threshold(filters.minComments)}`,
  ].join(','));
  const endpoint = order === 'recent' ? 'search_by_date' : 'search';
  return `https://hn.algolia.com/api/v1/${endpoint}?${params}`;
};

const arxivCategory = (topic) => {
  if (topic === 'cs.AI' || topic === 'cs.LG') return `cat:${topic}`;
  return '(cat:cs.AI OR cat:cs.LG)';
};

export const buildArxivRequest = (filters, now = new Date()) => {
  const clauses = [arxivCategory(filters.category || filters.topic)];
  const topic = filters.topic;
  if (TOPIC_TERMS[topic]?.length) {
    clauses.push(`(${TOPIC_TERMS[topic].map((term) => `all:${term}`).join(' OR ')})`);
  }
  clauses.push(`submittedDate:[${arxivDateKey(periodStart(filters.time, now))}0000 TO ${arxivDateKey(now)}2359]`);
  const params = new URLSearchParams({
    search_query: clauses.join(' AND '),
    start: '0',
    max_results: '24',
    sortBy: filters.sort === 'relevance' ? 'relevance' : 'submittedDate',
    sortOrder: 'descending',
  });
  return {
    url: `https://export.arxiv.org/api/query?${params}`,
    previewUrl: `/__scout/arxiv?${params}`,
  };
};

export const buildArxivUrl = (filters, now = new Date()) => buildArxivRequest(filters, now).url;

const isLoopbackPreview = (location) => {
  const loopback = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
  return ['http:', 'https:'].includes(location?.protocol) && loopback.has(location?.hostname);
};

export const resolveArxivRequestUrl = (request, location = globalThis.location) => (
  isLoopbackPreview(location) ? request.previewUrl : request.url
);

export const matchesTopic = (card, topic) => {
  const terms = TOPIC_TERMS[topic] || [];
  if (!terms.length) return true;
  const haystack = `${card.title} ${card.summary} ${(card.tags || []).join(' ')}`.toLowerCase();
  return terms.some((term) => haystack.includes(term.toLowerCase()));
};

export const validateSourceUrl = (value, source) => {
  try {
    const url = new URL(value);
    if (!Object.hasOwn(SOURCE_HOSTS, source)) return '';
    const allowedHosts = SOURCE_HOSTS[source];
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    if (allowedHosts && !allowedHosts.has(url.hostname)) return '';
    return url.href.replace(/\/$/, '');
  } catch {
    return '';
  }
};
