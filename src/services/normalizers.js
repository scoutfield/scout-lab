import { validateSourceUrl } from './query.js';

export const cleanText = (value = '') => `${value}`.replace(/\s+/g, ' ').trim();

const readableDescription = (value = '', limit = 420) => {
  const document = new DOMParser().parseFromString(`<body>${value}</body>`, 'text/html');
  const text = cleanText(document.body?.textContent || value);
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
};

export const compactNumber = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Not specified';
  if (Math.abs(number) >= 1_000_000_000_000_000) return number.toExponential(1).replace('+', '');
  if (number >= 1_000_000_000_000) return `${(number / 1_000_000_000_000).toFixed(1).replace('.0', '')}t`;
  if (number >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(1).replace('.0', '')}b`;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1).replace('.0', '')}m`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1).replace('.0', '')}k`;
  return `${number}`;
};

const numericText = (value = '') => Number(`${value}`.replace(/[^0-9]/g, '')) || 0;

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date not specified';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

const metric = (id, label, value, meaning) => ({ id, label, value, meaning });

const baseCard = ({ id, source, section, type, title, url, summary, tags = [], owner = '', publishedAt = '' }) => ({
  id,
  source,
  section,
  type,
  title: cleanText(title),
  url: validateSourceUrl(url, source),
  summary: cleanText(summary) || 'No description provided.',
  tags: tags.map(cleanText).filter(Boolean).slice(0, 4),
  owner: cleanText(owner),
  publishedAt,
  metrics: [],
  links: [],
  details: {},
});

export const parseGithubTrending = (html, time = 'week') => {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const timeLabel = { day: 'today', week: 'this week', month: 'this month' }[time] || 'this week';

  return [...document.querySelectorAll('article.Box-row')].map((article) => {
    const repositoryLink = [...article.querySelectorAll('h2 a')]
      .find((link) => /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(link.getAttribute('href') || ''));
    if (!repositoryLink) return null;

    const path = repositoryLink.getAttribute('href').replace(/^\//, '').replace(/\/$/, '');
    const description = cleanText(article.querySelector('p')?.textContent || '');
    const language = cleanText(article.querySelector('[itemprop="programmingLanguage"]')?.textContent || 'Not specified');
    const starLink = article.querySelector(`a[href="/${path}/stargazers"]`);
    const forkLink = article.querySelector(`a[href="/${path}/forks"]`);
    const periodNode = [...article.querySelectorAll('span')].find((node) => /stars?\s+(today|this week|this month)/i.test(node.textContent || ''));
    const periodStars = numericText(periodNode?.textContent);
    const totalStars = numericText(starLink?.textContent);
    const forks = numericText(forkLink?.textContent);
    const card = baseCard({
      id: `github:${path}`,
      source: 'github',
      section: 'code',
      type: 'Code',
      title: path,
      url: `https://github.com/${path}`,
      summary: description || [
        language === 'Not specified' ? 'GitHub repository' : `${language} repository`,
        totalStars ? `${compactNumber(totalStars)} stars` : '',
        forks ? `${compactNumber(forks)} forks` : '',
      ].filter(Boolean).join(' · ') + '.',
      tags: [language, 'GitHub Trending'],
      owner: path.split('/')[0],
    });

    return {
      ...card,
      metricLabel: `Stars ${timeLabel}`,
      metricValue: `+${periodStars}`,
      metrics: [
        metric('period-stars', `Stars ${timeLabel}`, periodStars, `Stars shown by GitHub Trending for ${timeLabel}`),
        metric('total-stars', 'Total stars', totalStars, 'Cumulative GitHub stars'),
        metric('forks', 'Forks', forks, 'Cumulative GitHub forks'),
      ],
      secondary: { left: language, right: `${compactNumber(totalStars)} stars · ${compactNumber(forks)} forks` },
      details: {
        language, totalStars, forks, periodStars, time,
        descriptionSource: description ? 'source' : 'fallback',
      },
    };
  }).filter(Boolean);
};

const tagValue = (tags, prefix) => tags.find((tag) => tag.startsWith(prefix))?.slice(prefix.length) || '';
const tagValues = (tags, prefix) => tags.filter((tag) => tag.startsWith(prefix)).map((tag) => tag.slice(prefix.length));

const MODEL_LIBRARIES = new Map([
  ['transformers', 'Transformers'],
  ['diffusers', 'Diffusers'],
  ['pytorch', 'PyTorch'],
  ['tf', 'TensorFlow'],
  ['jax', 'JAX'],
  ['gguf', 'GGUF'],
  ['mlx', 'MLX'],
]);

const formatParameters = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 'Not specified';
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  const [divisor, suffix] = units.find(([threshold]) => number >= threshold) || [1, ''];
  return `${(number / divisor).toFixed(1).replace('.0', '')}${suffix}`;
};

const directBaseModel = (tags) => tagValue(tags, 'base_model:')
  .replace(/^(quantized|finetune|adapter|merge):/, '');

const modelLibrary = (tags) => {
  const key = [...MODEL_LIBRARIES.keys()].find((item) => tags.includes(item));
  return MODEL_LIBRARIES.get(key) || 'Not specified';
};

export const normalizeModel = (model, rank = 'trending') => {
  const id = model.id || model.modelId;
  const tags = model.tags || [];
  const downloads = Number(model.downloads) || 0;
  const likes = Number(model.likes) || 0;
  const trending = Number(model.trendingScore) || 0;
  const parameters = Number(model.safetensors?.total || model.gguf?.total) || 0;
  const parameterLabel = formatParameters(parameters);
  const inferenceProviders = Array.isArray(model.inferenceProviderMapping)
    ? model.inferenceProviderMapping.filter(({ status }) => status !== 'error').map(({ provider }) => provider).filter(Boolean)
    : [];
  const inferenceAvailable = inferenceProviders.length > 0;
  const library = modelLibrary(tags);
  const parameterMetric = parameterLabel === 'Not specified'
    ? 'Parameters not specified'
    : `${parameterLabel} parameters`;
  const primary = {
    trending: [`${compactNumber(trending)} trending`, 'Trending score', trending, 'Hugging Face trending signal'],
    likes: [`${compactNumber(likes)} likes`, 'Likes', likes, 'Cumulative Hugging Face likes'],
    downloads: [`${compactNumber(downloads)} downloads`, 'Downloads', downloads, 'Cumulative Hugging Face downloads'],
    created: [`Created ${formatDate(model.createdAt)}`, 'Created', model.createdAt, 'Model creation date'],
    updated: [`Updated ${formatDate(model.lastModified)}`, 'Updated', model.lastModified, 'Model update date'],
    'most-parameters': [parameterMetric, 'Parameters', parameters, 'Model parameter count'],
    'least-parameters': [parameterMetric, 'Parameters', parameters, 'Model parameter count'],
  }[rank] || [`${compactNumber(trending)} trending`, 'Trending score', trending, 'Hugging Face trending signal'];
  const access = model.gated ? 'Gated' : 'Open';
  const pipeline = model.pipeline_tag || 'Task not specified';
  const license = tagValue(tags, 'license:') || 'Not specified';
  const baseModelId = directBaseModel(tags);
  const factualSummary = [
    pipeline.replaceAll('-', ' ').replace(/^./, (character) => character.toUpperCase()),
    parameterLabel === 'Not specified' ? 'parameters not specified' : `${parameterLabel} parameters`,
    library === 'Not specified' ? '' : library,
    license === 'Not specified' ? '' : license,
    access,
    inferenceAvailable ? 'Inference available' : '',
  ].filter(Boolean).join(' · ');
  const card = baseCard({
    id: `hf-model:${id}`,
    source: 'huggingface',
    section: 'models',
    type: 'Model',
    title: id,
    url: `https://huggingface.co/${id}`,
    summary: `${factualSummary}.`,
    tags: [
      pipeline,
      parameters ? parameterLabel : '',
      library === 'Not specified' ? '' : library,
      license === 'Not specified' ? '' : license,
    ],
    owner: id?.split('/')[0],
    publishedAt: model.createdAt || model.lastModified,
  });

  return {
    ...card,
    metricLabel: primary[1],
    metricValue: primary[0],
    metrics: [
      metric('trending', 'Trending score', trending, 'Hugging Face trending signal'),
      metric('downloads', 'Downloads', downloads, 'Cumulative Hugging Face downloads'),
      metric('likes', 'Likes', likes, 'Cumulative Hugging Face likes'),
      metric('parameters', 'Parameters', parameters, 'Model parameter count'),
    ],
    facts: [
      { label: 'Downloads', value: compactNumber(downloads) },
      { label: 'Likes', value: compactNumber(likes) },
      { label: 'Trending', value: compactNumber(trending) },
    ],
    secondary: {
      left: `${access}${inferenceAvailable ? ' · Inference available' : ''}`,
      right: `Updated ${formatDate(model.lastModified)}`,
    },
    details: {
      access,
      pipeline,
      license,
      library,
      parameters,
      parameterLabel,
      inferenceAvailable,
      inferenceProviders,
      baseModelId,
      descriptionSource: 'fallback',
      createdAt: model.createdAt,
      lastModified: model.lastModified,
    },
  };
};

export const groupModelCards = (cards) => {
  const families = new Map();
  cards.forEach((card) => {
    const familyId = card.details?.baseModelId || card.title;
    families.set(familyId, [...(families.get(familyId) || []), card]);
  });

  return [...families.entries()].map(([familyId, family]) => {
    const representative = family.find(({ title }) => title === familyId) || family[0];
    const relatedVariants = family
      .filter(({ id }) => id !== representative.id)
      .map(({ title, url, details }) => ({
        title,
        url,
        relation: details?.baseModelId ? 'Variant' : 'Related model',
      }));
    return relatedVariants.length ? { ...representative, relatedVariants } : { ...representative };
  });
};

export const filterModelsByUpdated = (cards, range, now = new Date()) => {
  const days = { day: 1, week: 7, month: 30 }[range];
  if (!days) return [...cards];
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return cards.filter((card) => {
    const updatedAt = new Date(card.details?.lastModified || card.publishedAt).getTime();
    return Number.isFinite(updatedAt) && updatedAt >= cutoff;
  });
};

export const normalizeDataset = (dataset, rank = 'trending') => {
  const tags = dataset.tags || [];
  const downloads = Number(dataset.downloads) || 0;
  const likes = Number(dataset.likes) || 0;
  const trending = Number(dataset.trendingScore) || 0;
  const rows = Number(dataset.datasetsServerInfo?.numRows ?? dataset.numRows) || 0;
  const totalSize = Number(dataset.mainSize) || 0;
  const primary = {
    trending: [`${compactNumber(trending)} trending`, 'Trending score', trending, 'Hugging Face trending signal'],
    newest: [`Created ${formatDate(dataset.createdAt)}`, 'Created', dataset.createdAt, 'Dataset creation date'],
    created: [`Created ${formatDate(dataset.createdAt)}`, 'Created', dataset.createdAt, 'Dataset creation date'],
    updated: [`Updated ${formatDate(dataset.lastModified)}`, 'Updated', dataset.lastModified, 'Dataset update date'],
    downloads: [`${compactNumber(downloads)} downloads`, 'Downloads', downloads, 'Cumulative Hugging Face downloads'],
    likes: [`${compactNumber(likes)} likes`, 'Likes', likes, 'Cumulative Hugging Face likes'],
    'most-rows': [`${compactNumber(rows)} rows`, 'Rows', rows, 'Dataset row count'],
    'least-rows': [`${compactNumber(rows)} rows`, 'Rows', rows, 'Dataset row count'],
    'largest-size': [`${compactNumber(totalSize)} bytes`, 'Total size', totalSize, 'Dataset total size in bytes'],
    'smallest-size': [`${compactNumber(totalSize)} bytes`, 'Total size', totalSize, 'Dataset total size in bytes'],
  }[rank] || [`${compactNumber(trending)} trending`, 'Trending score', trending, 'Hugging Face trending signal'];
  const task = tagValue(tags, 'task_categories:') || tagValue(tags, 'task_ids:') || 'Task not specified';
  const size = tagValue(tags, 'size_categories:') || 'Not specified';
  const language = tagValue(tags, 'language:') || 'Not specified';
  const license = tagValue(tags, 'license:') || 'Not specified';
  const modalities = dataset.datasetsServerInfo?.modalities || tagValues(tags, 'modality:');
  const formats = dataset.datasetsServerInfo?.formats || tagValues(tags, 'format:').filter((value) => value !== 'agent-traces');
  const type = dataset.isBenchmark || tags.includes('benchmark:official')
    ? 'Benchmark'
    : dataset.isTraces || tags.includes('format:agent-traces') ? 'Traces' : 'Standard';
  const card = baseCard({
    id: `hf-dataset:${dataset.id}`,
    source: 'huggingface',
    section: 'datasets',
    type: 'Dataset',
    title: dataset.id,
    url: `https://huggingface.co/datasets/${dataset.id}`,
    summary: readableDescription(dataset.description) || `${task.replaceAll('-', ' ')} dataset on Hugging Face.`,
    tags: [...modalities, ...formats, ...(type === 'Standard' ? [] : [type]), task, size, language, license],
    owner: dataset.id?.split('/')[0],
    publishedAt: dataset.lastModified || dataset.createdAt,
  });

  return {
    ...card,
    metricLabel: primary[1],
    metricValue: primary[0],
    metrics: [
      metric('trending', 'Trending score', trending, 'Hugging Face trending signal'),
      metric('downloads', 'Downloads', downloads, 'Cumulative Hugging Face downloads'),
      metric('likes', 'Likes', likes, 'Cumulative Hugging Face likes'),
      metric('rows', 'Rows', rows, 'Dataset row count'),
      metric('total-size', 'Total size', totalSize, 'Dataset total size in bytes'),
    ],
    secondary: { left: task.replaceAll('-', ' '), right: `${size} · ${compactNumber(likes)} likes` },
    details: {
      task, size, language, license, rows, totalSize, modalities: [...modalities],
      formats: [...formats], type, createdAt: dataset.createdAt, lastModified: dataset.lastModified,
    },
  };
};

export const parseHuggingFaceDatasetsPage = (html) => {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const hydrator = document.querySelector('[data-target="DatasetList"][data-props]');
  if (!hydrator) throw new Error('Hugging Face DatasetList state was not found');
  try {
    const values = JSON.parse(hydrator.getAttribute('data-props')).initialValues;
    if (!Array.isArray(values?.datasets)) throw new Error('datasets missing');
    return values.datasets.map((dataset) => ({ ...dataset, id: dataset.id || dataset._id }));
  } catch {
    throw new Error('Hugging Face DatasetList state is invalid');
  }
};

export const normalizeCommunityPaper = (entry) => {
  const paper = entry.paper || entry;
  const id = paper.id || entry.id;
  const authors = (paper.authors || []).map((author) => author.name).filter(Boolean);
  const summary = paper.ai_summary || entry.ai_summary || paper.summary || entry.summary;
  const upvotes = Number(paper.upvotes ?? entry.upvotes) || 0;
  const comments = Number(entry.numComments ?? paper.numComments) || 0;
  const publishedAt = paper.publishedAt || entry.publishedAt;
  const featuredAt = paper.submittedOnDailyAt || entry.submittedOnDailyAt || publishedAt;
  const githubRepo = paper.githubRepo || entry.githubRepo || '';
  const card = baseCard({
    id: `hf-paper:${id}`,
    source: 'huggingface',
    section: 'papers',
    type: 'Paper',
    title: paper.title || entry.title,
    url: `https://huggingface.co/papers/${id}`,
    summary,
    tags: paper.ai_keywords || entry.ai_keywords || [],
    owner: authors.join(', '),
    publishedAt,
  });

  return {
    ...card,
    summaryLabel: paper.ai_summary || entry.ai_summary ? 'HF summary' : '',
    metricLabel: 'Community upvotes',
    metricValue: `${compactNumber(upvotes)} upvotes`,
    metrics: [
      metric('upvotes', 'Community upvotes', upvotes, 'Hugging Face Daily Papers upvotes'),
      metric('comments', 'Comments', comments, 'Hugging Face Daily Papers comments'),
    ],
    links: [
      { id: 'pdf', label: 'PDF', url: `https://arxiv.org/pdf/${id}`, source: 'arxiv' },
      githubRepo ? { id: 'code', label: 'Code', url: githubRepo, source: 'github' } : null,
    ].filter(Boolean).filter(({ url, source }) => validateSourceUrl(url, source)),
    secondary: { left: `Featured ${formatDate(featuredAt)}`, right: `${compactNumber(comments)} comments` },
    details: {
      authors,
      organization: paper.organization?.name || entry.organization?.name || '',
      featuredAt,
      publishedAt,
      upvotes,
      comments,
    },
  };
};

export const parseArxivFeed = (xml) => {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('arXiv returned invalid XML');

  return [...document.querySelectorAll('entry')].map((entry) => {
    const sourceId = cleanText(entry.querySelector('id')?.textContent);
    const id = sourceId.split('/').pop();
    const categories = [...entry.querySelectorAll('category')].map((node) => node.getAttribute('term')).filter(Boolean);
    const authors = [...entry.querySelectorAll('author > name')].map((node) => cleanText(node.textContent)).filter(Boolean);
    const pdf = [...entry.querySelectorAll('link')].find((link) => link.getAttribute('title') === 'pdf')?.getAttribute('href');
    const abstractUrl = `https://arxiv.org/abs/${id}`;
    const card = baseCard({
      id: `arxiv:${id}`,
      source: 'arxiv',
      section: 'papers',
      type: 'Paper',
      title: entry.querySelector('title')?.textContent,
      url: abstractUrl,
      summary: entry.querySelector('summary')?.textContent,
      tags: categories,
      owner: authors.join(', '),
      publishedAt: entry.querySelector('published')?.textContent,
    });

    return {
      ...card,
      metricLabel: 'Primary category',
      metricValue: categories[0] || 'arXiv',
      metrics: [metric('submitted', 'Submitted', card.publishedAt, 'arXiv submission date')],
      links: pdf && validateSourceUrl(pdf, 'arxiv')
        ? [{ id: 'pdf', label: 'PDF', url: validateSourceUrl(pdf, 'arxiv') }]
        : [],
      secondary: { left: authors.slice(0, 2).join(', ') || 'Authors not specified', right: `Submitted ${formatDate(card.publishedAt)}` },
      details: { authors, categories, updatedAt: entry.querySelector('updated')?.textContent || '' },
    };
  });
};

const AI_POST_PATTERN = /\b(ai|artificial intelligence|llms?|gpt(-?\d[\w.]*)?|chatgpt|openai|anthropic|claude|gemini|deepseek|copilot|machine learning|deep learning|neural (networks?|models?)|large language models?|language models?|foundation models?|model weights|agentic|text[- ]to[- ](image|video|speech)|image[- ]to[- ]video|(image|video|speech) generat\w*|stable diffusion|diffusion models?|retrieval[- ]augmented|fine[- ]?tun\w*|transformer (models?|architectures?)|mcp (servers?|clients?|tools?)|model context protocol)\b/i;
const AI_POST_DOMAINS = ['openai.com', 'anthropic.com', 'huggingface.co', 'deepmind.google', 'mistral.ai', 'ai.google.dev', 'stability.ai'];
const AI_POST_ACRONYMS = /\b(RAG|MCP)\b/;

const hasAiContext = (text) => AI_POST_PATTERN.test(text) || AI_POST_ACRONYMS.test(text)
  || (/\bagents?\b/i.test(text) && /\b(prompts?|tokens?|reasoning|memory)\b/i.test(text));

export const isAiPost = (card) => {
  const domain = card.details?.domain || '';
  return hasAiContext(card.title || '')
    || (!domain && hasAiContext(card.summary || ''))
    || AI_POST_DOMAINS.some((host) => domain === host || domain.endsWith(`.${host}`));
};

const POST_TOPIC_PATTERNS = {
  agents: /\b(agents?|agentic|tool[- ]us\w*|mcp|model context protocol)\b/i,
  llms: /\b(llms?|language models?|transformers?|gpt[\w.-]*|chatgpt|claude|gemini|llama|mistral|deepseek)\b/i,
  rag: /\b(rag|retrieval|embeddings?)\b/i,
  evaluation: /\b(evaluat\w*|benchmarks?|evals?)\b/i,
  multimodal: /\b(multimodal|vision|diffusion|text[- ]to[- ](image|video|speech)|image[- ]to[- ]video|(image|video|speech) generat\w*)\b/i,
};

export const matchesPostTopic = (card, topic) => !POST_TOPIC_PATTERNS[topic]
  || POST_TOPIC_PATTERNS[topic].test(`${card.title} ${card.summary || ''}`);

const hostOf = (value) => {
  try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return ''; }
};

// Hacker News ranking approximation: points decay with age.
export const postHotScore = (points, createdAt, now = Date.now()) => {
  const ageHours = Math.max(0, (now - new Date(createdAt).getTime()) / 3_600_000) || 0;
  return Math.max(points - 1, 0) / ((ageHours + 2) ** 1.8);
};

export const normalizePost = (hit, now = Date.now()) => {
  const id = `${hit.objectID || hit.story_id || ''}`;
  const points = Number(hit.points) || 0;
  const comments = Number(hit.num_comments) || 0;
  const domain = hostOf(hit.url);
  const articleUrl = validateSourceUrl(hit.url, 'web');
  const publishedAt = hit.created_at || '';
  const card = baseCard({
    id: `hn:${id}`,
    source: 'hackernews',
    section: 'posts',
    type: 'Post',
    title: hit.title || hit.story_title,
    url: `https://news.ycombinator.com/item?id=${encodeURIComponent(id)}`,
    summary: readableDescription(hit.story_text || '') || (domain
      ? `Shared from ${domain}.`
      : 'Discussion thread on Hacker News.'),
    tags: ['Hacker News', domain].filter(Boolean),
    owner: hit.author || '',
    publishedAt,
  });

  return {
    ...card,
    metricLabel: 'Hacker News points and comments',
    metricValue: `${compactNumber(points)} pts · ${compactNumber(comments)} comments`,
    metrics: [
      metric('points', 'Points', points, 'Hacker News points'),
      metric('comments', 'Comments', comments, 'Hacker News comments'),
    ],
    openLabel: 'Discuss',
    links: articleUrl ? [{ id: 'article', label: 'Article', url: articleUrl, source: 'web' }] : [],
    secondary: {
      left: `${domain || 'Hacker News'}${hit.author ? ` · ${hit.author}` : ''}`,
      right: `Posted ${formatDate(publishedAt)}`,
    },
    details: {
      points, comments, domain, publishedAt, hotScore: postHotScore(points, publishedAt, now),
    },
  };
};
