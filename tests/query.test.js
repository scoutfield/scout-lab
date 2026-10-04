import { describe, expect, it } from 'vitest';

import {
  createDefaultFilters,
  DATASET_TASK_OPTIONS,
  normalizeWorkbenchFilters,
  REMOTE_CACHE_TTL,
  WORKBENCHES,
} from '../src/workbenches.js';
import {
  buildArxivUrl,
  buildArxivRequest,
  buildCommunityPapersUrl,
  buildDatasetsUrl,
  buildDatasetsRequest,
  buildGithubRequest,
  buildModelsUrl,
  buildPostsUrl,
  matchesTopic,
  resolveGithubRequestUrl,
  resolveArxivRequestUrl,
  resolveDatasetsRequestUrl,
  stableSerialize,
  validateSourceUrl,
} from '../src/services/query.js';

const now = new Date('2026-08-28T12:00:00.000Z');

describe('workbench query builders', () => {
  it('uses one six-hour TTL for every remote workbench', () => {
    expect(REMOTE_CACHE_TTL).toBe(6 * 60 * 60 * 1000);
    expect(['today', 'code', 'models', 'datasets', 'papers', 'posts']
      .map((section) => WORKBENCHES[section].cacheTtl)).toEqual(Array(6).fill(REMOTE_CACHE_TTL));
    expect(WORKBENCHES.library.cacheTtl).toBe(Infinity);
  });

  it('creates independent defaults for every workbench', () => {
    const first = createDefaultFilters();
    const second = createDefaultFilters();

    first.code.language = 'python';

    expect(second.code.language).toBe('all');
    expect(second.code).toEqual({ time: 'day', spokenLanguage: 'all', language: 'all' });
    expect(second.today).toEqual({});
    expect(Object.keys(second)).toEqual(['today', 'code', 'models', 'datasets', 'papers', 'posts', 'library']);
  });

  it('drops the removed legacy Today topic filter', () => {
    expect(normalizeWorkbenchFilters('today', { topic: 'agents' })).toEqual({});
  });

  it('drops legacy Code modes while preserving supported filters', () => {
    expect(normalizeWorkbenchFilters('code', {
      mode: 'active',
      time: 'month',
      language: 'python',
      topic: 'agents',
    })).toEqual({ time: 'month', spokenLanguage: 'all', language: 'python' });

    expect(normalizeWorkbenchFilters('code', {
      spokenLanguage: 'unsupported',
      time: 'day',
    })).toEqual({ time: 'day', spokenLanguage: 'all', language: 'all' });
  });

  it('serializes query state with stable key ordering', () => {
    expect(stableSerialize({ b: 2, a: { d: 4, c: 3 } }))
      .toBe('{"a":{"c":3,"d":4},"b":2}');
    expect(stableSerialize({ values: [{ z: 1, a: 2 }] })).toBe('{"values":[{"a":2,"z":1}]}');
  });

  it('builds exact GitHub Trending URLs for Any, English, and Chinese', () => {
    const english = buildGithubRequest({
      time: 'week',
      spokenLanguage: 'en',
      language: 'python',
      topic: 'agents',
    }, now);
    const chinese = buildGithubRequest({
      time: 'month',
      spokenLanguage: 'zh',
      language: 'all',
      topic: 'all',
    }, now);
    const any = buildGithubRequest({
      time: 'day',
      spokenLanguage: 'all',
      language: 'all',
      topic: 'all',
    }, now);

    expect(english).toEqual(expect.objectContaining({
      kind: 'trending',
      url: 'https://github.com/trending/python?since=weekly&spoken_language_code=en',
    }));
    expect(chinese.url).toBe('https://github.com/trending?since=monthly&spoken_language_code=zh');
    expect(any.url).toBe('https://github.com/trending?since=daily');
    expect(english).not.toHaveProperty('fallbackUrl');

    const preview = new URL(english.previewUrl, 'http://127.0.0.1:5179');
    expect(preview.pathname).toBe('/__scout/github-trending');
    expect(preview.searchParams.get('since')).toBe('weekly');
    expect(preview.searchParams.get('language')).toBe('python');
    expect(preview.searchParams.get('spoken_language_code')).toBe('en');
  });

  it('uses the local proxy only for loopback HTTP previews', () => {
    const request = buildGithubRequest({
      time: 'week', spokenLanguage: 'zh', language: 'all', topic: 'all',
    }, now);

    expect(resolveGithubRequestUrl(request, { protocol: 'http:', hostname: '127.0.0.1' })).toBe(request.previewUrl);
    expect(resolveGithubRequestUrl(request, { protocol: 'https:', hostname: 'localhost' })).toBe(request.previewUrl);
    expect(resolveGithubRequestUrl(request, { protocol: 'chrome-extension:', hostname: 'extension-id' })).toBe(request.url);
    expect(resolveGithubRequestUrl(request, { protocol: 'https:', hostname: 'example.com' })).toBe(request.url);
  });

  it('maps every Hugging Face model sort to the source field and direction', () => {
    const expected = [
      ['trending', 'trendingScore', '-1'],
      ['likes', 'likes', '-1'],
      ['downloads', 'downloads', '-1'],
      ['created', 'createdAt', '-1'],
      ['updated', 'lastModified', '-1'],
      ['most-parameters', 'num_parameters', '-1'],
      ['least-parameters', 'num_parameters', '1'],
    ];

    expect(expected.map(([rank, sort, direction]) => {
      const url = new URL(buildModelsUrl({
        rank, task: 'all', size: 'any', baseOnly: 'off', inference: 'off',
        library: 'all', license: 'all', access: 'all', app: 'all', updated: 'all',
      }));
      return [url.searchParams.get('sort'), url.searchParams.get('direction')];
    })).toEqual(expected.map(([, sort, direction]) => [sort, direction]));
  });

  it('maps Hugging Face discovery and runtime filters to supported parameters', () => {
    const url = new URL(buildModelsUrl({
      rank: 'trending',
      task: 'text-generation',
      size: '1b-7b',
      baseOnly: 'on',
      inference: 'on',
      library: 'transformers',
      license: 'apache-2.0',
      access: 'open',
      app: 'ollama',
      updated: 'week',
    }));

    expect(url.searchParams.get('sort')).toBe('trendingScore');
    expect(url.searchParams.get('pipeline_tag')).toBe('text-generation');
    expect(url.searchParams.get('num_parameters')).toBe('min:1B,max:7B');
    expect(url.searchParams.get('base_model_relation')).toBe('base');
    expect(url.searchParams.get('inference_provider')).toBe('all');
    expect(url.searchParams.getAll('filter')).toEqual(['transformers', 'license:apache-2.0']);
    expect(url.searchParams.get('gated')).toBe('false');
    expect(url.searchParams.get('apps')).toBe('ollama');
    expect(url.searchParams.has('updated')).toBe(false);
    expect(url.searchParams.getAll('expand[]')).toEqual(expect.arrayContaining([
      'safetensors', 'gguf', 'inferenceProviderMapping', 'createdAt', 'lastModified',
    ]));

    const minimal = new URL(buildModelsUrl({
      rank: 'created', task: 'all', size: '30b-plus', baseOnly: 'off', inference: 'off',
      library: 'all', license: 'all', access: 'gated', app: 'all', updated: 'all',
    }));
    expect(minimal.searchParams.get('sort')).toBe('createdAt');
    expect(minimal.searchParams.get('pipeline_tag')).toBeNull();
    expect(minimal.searchParams.get('num_parameters')).toBe('min:30B');
    expect(minimal.searchParams.get('gated')).toBe('true');
    expect(minimal.searchParams.get('base_model_relation')).toBeNull();
    expect(minimal.searchParams.get('inference_provider')).toBeNull();
    expect(minimal.searchParams.getAll('filter')).toEqual([]);
    expect(minimal.searchParams.get('apps')).toBeNull();
  });

  it('maps exact dataset task and size values with independent advanced filters', () => {
    const url = new URL(buildDatasetsUrl({
      rank: 'downloads',
      task: 'text-retrieval',
      size: '10k-100k',
      language: 'zh',
      license: 'apache-2.0',
      access: 'open',
      modality: 'image',
      format: 'parquet',
      type: 'benchmark',
    }));

    expect(url.searchParams.get('sort')).toBe('downloads');
    expect(url.searchParams.getAll('filter')).toEqual([
      'task_categories:text-retrieval',
      'size_categories:10K<n<100K',
      'modality:image',
      'format:parquet',
      'language:zh',
      'license:apache-2.0',
      'benchmark:official',
    ]);
    expect(url.searchParams.get('gated')).toBe('false');
    expect(url.searchParams.get('limit')).toBe('48');
  });

  it('maps every Hugging Face dataset sort to its source-backed request', () => {
    const base = {
      task: 'all', size: 'any', modality: 'all', format: 'all', type: 'all',
      language: 'all', license: 'all', access: 'all', topic: 'all',
    };
    const expected = [
      ['trending', 'api', 'trendingScore', '-1'],
      ['likes', 'api', 'likes', '-1'],
      ['downloads', 'api', 'downloads', '-1'],
      ['created', 'api', 'createdAt', '-1'],
      ['updated', 'api', 'lastModified', '-1'],
      ['most-rows', 'page', 'most_rows', null],
      ['least-rows', 'page', 'least_rows', null],
      ['largest-size', 'api', 'mainSize', '-1'],
      ['smallest-size', 'api', 'mainSize', '1'],
    ];

    expect(expected.map(([rank]) => {
      const request = buildDatasetsRequest({ ...base, rank });
      const url = new URL(request.url);
      return [request.kind, url.searchParams.get('sort'), url.searchParams.get('direction')];
    })).toEqual(expected.map(([, kind, sort, direction]) => [kind, sort, direction]));
  });

  it('builds and resolves the fixed Hugging Face page request for row sorts', () => {
    const request = buildDatasetsRequest({
      rank: 'most-rows', task: 'text-retrieval', size: '10k-100k', modality: 'image',
      format: 'parquet', type: 'traces', language: 'zh', license: 'apache-2.0',
      access: 'open', topic: 'all',
    });
    const source = new URL(request.url);
    expect(source.origin + source.pathname).toBe('https://huggingface.co/datasets');
    expect(source.searchParams.get('sort')).toBe('most_rows');
    expect(source.searchParams.get('task_categories')).toBe('task_categories:text-retrieval');
    expect(source.searchParams.get('size_categories')).toBe('size_categories:10K<n<100K');
    expect(source.searchParams.get('modality')).toBe('modality:image');
    expect(source.searchParams.get('format')).toBe('format:agent-traces');
    expect(resolveDatasetsRequestUrl(request, { protocol: 'http:', hostname: 'localhost' }))
      .toBe(request.previewUrl);
    expect(resolveDatasetsRequestUrl(request, { protocol: 'chrome-extension:', hostname: 'id' }))
      .toBe(request.url);
  });

  it('keeps all 52 source-visible dataset tasks grouped and unique', () => {
    const tasks = DATASET_TASK_OPTIONS.filter(({ value }) => value !== 'all');
    expect(tasks).toHaveLength(52);
    expect(new Set(tasks.map(({ value }) => value)).size).toBe(52);
    expect(new Set(tasks.map(({ group }) => group))).toEqual(new Set([
      'Multimodal', 'Natural Language Processing', 'Audio', 'Computer Vision',
      'Reinforcement Learning', 'Tabular', 'Other',
    ]));
    expect(tasks.map(({ value }) => value)).toEqual(expect.arrayContaining([
      'text-retrieval', 'image-classification', 'automatic-speech-recognition',
      'robotics', 'tabular-to-text', 'graph-ml',
    ]));
  });

  it('builds community and raw paper time ranges', () => {
    const community = new URL(buildCommunityPapersUrl({ time: 'week', sort: 'trending' }, now));
    const arxiv = new URL(buildArxivUrl({
      time: 'month',
      category: 'cs.LG',
      topic: 'evaluation',
      sort: 'newest',
    }, now)).searchParams.get('search_query');

    expect(community.searchParams.get('week')).toBe('2026-W35');
    expect(community.searchParams.has('sort')).toBe(false);
    expect(arxiv).toContain('cat:cs.LG');
    expect(arxiv).toContain('submittedDate:[202607290000 TO 202608282359]');
    expect(arxiv).toContain('all:evaluation');

    const daily = new URL(buildCommunityPapersUrl({ time: 'day', sort: 'recent' }, now));
    const monthly = new URL(buildCommunityPapersUrl({ time: 'month', sort: 'trending' }, now));
    expect(daily.searchParams.get('date')).toBe('2026-08-28');
    expect(daily.searchParams.has('sort')).toBe(false);
    expect(monthly.searchParams.get('month')).toBe('2026-08');
  });

  it('uses the local arXiv proxy only for loopback previews', () => {
    const request = buildArxivRequest({ time: 'week', topic: 'cs.AI', sort: 'newest' }, now);
    expect(request.url).toBe(buildArxivUrl({ time: 'week', topic: 'cs.AI', sort: 'newest' }, now));
    expect(resolveArxivRequestUrl(request, { protocol: 'http:', hostname: '127.0.0.1' })).toBe(request.previewUrl);
    expect(resolveArxivRequestUrl(request, { protocol: 'chrome-extension:', hostname: 'id' })).toBe(request.url);
  });

  it('matches source cards using the selected topic vocabulary', () => {
    const card = { title: 'Agent evaluation', summary: 'Tool workflow benchmark', tags: ['agents'] };
    expect(matchesTopic(card, 'all')).toBe(true);
    expect(matchesTopic(card, 'agents')).toBe(true);
    expect(matchesTopic(card, 'rag')).toBe(false);
  });
});

describe('source URL validation', () => {
  it('accepts expected HTTPS source links', () => {
    expect(validateSourceUrl('https://github.com/openai/evals', 'github')).toBe('https://github.com/openai/evals');
    expect(validateSourceUrl('https://huggingface.co/openai/gpt-oss-20b', 'huggingface')).toBe('https://huggingface.co/openai/gpt-oss-20b');
    expect(validateSourceUrl('https://arxiv.org/abs/2608.12345', 'arxiv')).toBe('https://arxiv.org/abs/2608.12345');
  });

  it('rejects scripts, HTTP, credentials, and unexpected hosts', () => {
    expect(validateSourceUrl('javascript:alert(1)', 'github')).toBe('');
    expect(validateSourceUrl('http://github.com/openai/evals', 'github')).toBe('');
    expect(validateSourceUrl('https://user:pass@github.com/openai/evals', 'github')).toBe('');
    expect(validateSourceUrl('https://github.example.com/openai/evals', 'github')).toBe('');
    expect(validateSourceUrl('not a URL', 'github')).toBe('');
    expect(validateSourceUrl('https://github.com/openai/evals', 'unknown')).toBe('');
  });
});

describe('Hacker News posts', () => {
  const now = new Date('2026-10-04T00:00:00Z');
  const seconds = Math.floor(now.getTime() / 1000);

  it('queries the front page for Hot without a time window', () => {
    const url = new URL(buildPostsUrl({ rank: 'hot', time: 'week', topic: 'all' }, now));
    expect(url.origin + url.pathname).toBe('https://hn.algolia.com/api/v1/search');
    expect(url.searchParams.get('tags')).toBe('story,front_page');
    expect(url.searchParams.get('numericFilters')).toBeNull();
    expect(url.searchParams.get('query')).toContain('LLM');
  });

  it('limits Trending to the last day and Top to the selected range', () => {
    const trending = new URL(buildPostsUrl({ rank: 'trending', time: 'month', topic: 'all' }, now));
    expect(trending.searchParams.get('numericFilters')).toBe(`created_at_i>${seconds - 86400},points>=5`);
    const top = new URL(buildPostsUrl({ rank: 'top', time: 'month', topic: 'all' }, now));
    expect(top.searchParams.get('numericFilters')).toBe(`created_at_i>${seconds - 30 * 86400},points>=20`);
  });

  it('narrows the query with the AI topic and quotes phrases', () => {
    const url = new URL(buildPostsUrl({ rank: 'top', time: 'week', topic: 'llms' }, now));
    expect(url.searchParams.get('query')).toBe('llm "language model" transformer');
    expect(url.searchParams.get('optionalWords')).toBe(url.searchParams.get('query'));
  });

  it('allows outbound article links on any https host but nothing else', () => {
    expect(validateSourceUrl('https://example.com/post', 'web')).toBe('https://example.com/post');
    expect(validateSourceUrl('http://example.com/post', 'web')).toBe('');
    expect(validateSourceUrl('https://user:pw@example.com/', 'web')).toBe('');
    expect(validateSourceUrl('https://news.ycombinator.com/item?id=1', 'hackernews')).toBe('https://news.ycombinator.com/item?id=1');
    expect(validateSourceUrl('https://example.com/', 'hackernews')).toBe('');
    expect(validateSourceUrl('https://example.com/', 'constructor')).toBe('');
  });
});
