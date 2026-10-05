import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  normalizeCommunityPaper,
  compactNumber,
  normalizeDataset,
  normalizeModel,
  normalizePost,
  normalizeRedditPost,
  isUsableRedditPost,
  isAiPost,
  groupModelCards,
  filterModelsByUpdated,
  parseArxivFeed,
  parseGithubTrending,
  parseHuggingFaceDatasetsPage,
} from '../src/services/normalizers.js';

const fixture = (name) => readFile(resolve(process.cwd(), 'tests', 'fixtures', name), 'utf8');

describe('source normalizers', () => {
  it('formats small, large, and missing source metrics', () => {
    expect(compactNumber(99)).toBe('99');
    expect(compactNumber(1_200_000)).toBe('1.2m');
    expect(compactNumber(22_090_170_000)).toBe('22.1b');
    expect(compactNumber(9_223_372_036_854_775_000)).toBe('9.2e18');
    expect(compactNumber(undefined)).toBe('Not specified');
  });

  it('parses GitHub Trending totals and period stars separately', async () => {
    const cards = parseGithubTrending(await fixture('github-trending.html'), 'week');

    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      id: 'github:example-labs/agent-kit',
      title: 'example-labs/agent-kit',
      url: 'https://github.com/example-labs/agent-kit',
      summary: 'A useful toolkit for building reliable AI agents.',
      metricLabel: 'Stars this week',
      metricValue: '+373',
      details: { descriptionSource: 'source' },
    });
    expect(cards[0].metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'period-stars', value: 373 }),
      expect.objectContaining({ id: 'total-stars', value: 12345 }),
      expect.objectContaining({ id: 'forks', value: 789 }),
    ]));
  });

  it('normalizes model and dataset source metadata', () => {
    const model = normalizeModel({
      id: 'Qwen/Qwen3.8-Flash-Next',
      pipeline_tag: 'image-text-to-text',
      downloads: 4810,
      likes: 4181,
      trendingScore: 4050,
      gated: false,
      tags: ['transformers', 'license:other'],
      safetensors: { total: 180_000_000_000 },
      inferenceProviderMapping: [{ provider: 'together', status: 'live' }],
      createdAt: '2026-08-24T08:24:59Z',
      lastModified: '2026-08-27T05:03:36Z',
    }, 'trending');
    const dataset = normalizeDataset({
      id: 'markov-ai/cad-1000-hours',
      downloads: 56917,
      likes: 201,
      trendingScore: 157,
      tags: ['task_categories:computer-vision', 'size_categories:1K<n<10K', 'language:en', 'license:apache-2.0'],
      lastModified: '2026-08-21T12:26:29Z',
    }, 'downloads');

    expect(model.metricValue).toBe('4k trending');
    expect(model.details).toMatchObject({
      access: 'Open', parameters: 180_000_000_000, parameterLabel: '180B',
      library: 'Transformers', inferenceAvailable: true,
    });
    expect(model.tags).toEqual(expect.arrayContaining(['180B', 'Transformers', 'other']));
    expect(model.secondary.left).toBe('Open · Inference available');
    expect(model.summary).toBe('Image text to text · 180B parameters · Transformers · other · Open · Inference available.');
    expect(model.details.descriptionSource).toBe('fallback');
    expect(dataset.metricValue).toBe('56.9k downloads');
    expect(dataset.details).toMatchObject({ size: '1K<n<10K', language: 'en', license: 'apache-2.0' });

    expect(normalizeModel({ id: 'owner/new', tags: [], createdAt: '2026-08-28T00:00:00Z' }, 'created').metricValue)
      .toBe('Created Aug 28');
    expect(normalizeModel({ id: 'owner/liked', tags: [], likes: 12 }, 'likes').metricValue).toBe('12 likes');
    expect(normalizeModel({ id: 'owner/updated', tags: [], lastModified: '2026-08-28T00:00:00Z' }, 'updated').metricValue)
      .toBe('Updated Aug 28');
    expect(normalizeModel({ id: 'owner/large', tags: [], gguf: { total: 27_000_000_000 } }, 'most-parameters').metricValue)
      .toBe('27B parameters');
    expect(normalizeDataset({ id: 'owner/new-data', tags: [], lastModified: '2026-08-28T00:00:00Z' }, 'newest').details)
      .toMatchObject({ size: 'Not specified', language: 'Not specified', license: 'Not specified' });
    const readable = normalizeDataset({
      id: 'owner/readable', createdAt: '2026-08-20T00:00:00Z', tags: [],
      description: 'A&nbsp;dataset <strong>for careful reading</strong>. '.repeat(30),
    }, 'newest');
    expect(readable.metricValue).toBe('Created Aug 20');
    expect(readable.summary).not.toContain('&nbsp;');
    expect(readable.summary).not.toContain('<strong>');
    expect(readable.summary.length).toBeLessThanOrEqual(421);
  });

  it('parses structured Hugging Face dataset page metadata', async () => {
    const datasets = parseHuggingFaceDatasetsPage(await fixture('huggingface-datasets.html'));
    const card = normalizeDataset(datasets[0], 'most-rows');

    expect(datasets).toHaveLength(1);
    expect(card.metricValue).toBe('22.1m rows');
    expect(card.tags).toEqual(expect.arrayContaining(['image', 'text', 'parquet', 'Benchmark']));
    expect(card.details).toMatchObject({
      rows: 22090170,
      modalities: ['image', 'text'],
      formats: ['parquet'],
      type: 'Benchmark',
    });
  });

  it('rejects missing or malformed Hugging Face dataset page state', () => {
    expect(() => parseHuggingFaceDatasetsPage('<main>missing</main>')).toThrow(/DatasetList/);
    expect(() => parseHuggingFaceDatasetsPage('<div data-target="DatasetList" data-props="not json"></div>'))
      .toThrow(/invalid/i);
  });

  it('groups variants beneath a present base model without mutating source cards', () => {
    const base = normalizeModel({
      id: 'Qwen/Qwen-7B', tags: ['transformers'], likes: 100,
    });
    const quantized = normalizeModel({
      id: 'community/Qwen-7B-GGUF',
      tags: ['gguf', 'base_model:Qwen/Qwen-7B', 'base_model:quantized:Qwen/Qwen-7B'],
      likes: 90,
    });
    const fineTune = normalizeModel({
      id: 'community/Qwen-7B-instruct',
      tags: ['transformers', 'base_model:finetune:Qwen/Qwen-7B'],
      likes: 80,
    });
    const source = [quantized, base, fineTune];

    const grouped = groupModelCards(source);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].title).toBe('Qwen/Qwen-7B');
    expect(grouped[0].relatedVariants.map(({ title }) => title)).toEqual([
      'community/Qwen-7B-GGUF', 'community/Qwen-7B-instruct',
    ]);
    expect(source.every((card) => card.relatedVariants === undefined)).toBe(true);
  });

  it('uses the highest-ranked variant when the base is absent and filters updated ranges', () => {
    const recent = normalizeModel({
      id: 'community/Qwen-7B-GGUF', tags: ['base_model:quantized:Qwen/Qwen-7B'],
      lastModified: '2026-08-28T00:00:00Z',
    });
    const older = normalizeModel({
      id: 'community/Qwen-7B-MLX', tags: ['base_model:quantized:Qwen/Qwen-7B'],
      lastModified: '2026-07-01T00:00:00Z',
    });

    expect(groupModelCards([recent, older])[0].title).toBe(recent.title);
    expect(filterModelsByUpdated([recent, older], 'week', new Date('2026-08-29T00:00:00Z')))
      .toEqual([recent]);
    expect(filterModelsByUpdated([recent, older], 'all', new Date('2026-08-29T00:00:00Z')))
      .toEqual([recent, older]);
  });

  it('normalizes Hugging Face community papers with source-provided summaries', () => {
    const card = normalizeCommunityPaper({
      paper: {
        id: '2608.09888',
        title: 'Latent Reasoning',
        authors: [{ name: 'Ada Researcher' }],
        ai_summary: 'A source-provided summary.',
        ai_keywords: ['reasoning', 'agents'],
        upvotes: 761,
        publishedAt: '2026-08-10T00:00:00Z',
        submittedOnDailyAt: '2026-08-28T00:00:00Z',
        githubRepo: 'https://github.com/example/latent-reasoning',
      },
      numComments: 5,
    });

    expect(card.url).toBe('https://huggingface.co/papers/2608.09888');
    expect(card.summaryLabel).toBe('HF summary');
    expect(card.metricValue).toBe('761 upvotes');
    expect(card.secondary.right).toBe('5 comments');
    expect(card.secondary.left).toBe('Featured Aug 28');
    expect(card.links).toEqual([
      { id: 'pdf', label: 'PDF', url: 'https://arxiv.org/pdf/2608.09888', source: 'arxiv' },
      { id: 'code', label: 'Code', url: 'https://github.com/example/latent-reasoning', source: 'github' },
    ]);

    const plain = normalizeCommunityPaper({
      id: '2608.00001', title: 'Plain summary', summary: 'Human summary.', authors: [], upvotes: 0,
    });
    expect(plain.summaryLabel).toBe('');
    expect(plain.summary).toBe('Human summary.');
  });

  it('parses arXiv Atom links, authors, categories, and dates', async () => {
    const cards = parseArxivFeed(await fixture('arxiv.xml'));

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: 'arxiv:2608.12345v1',
      owner: 'Ada Researcher, Lin Scientist',
      url: 'https://arxiv.org/abs/2608.12345v1',
      metricValue: 'cs.AI',
    });
    expect(cards[0].links).toEqual(expect.arrayContaining([
      { id: 'pdf', label: 'PDF', url: 'https://arxiv.org/pdf/2608.12345v1' },
    ]));
  });

  it('rejects invalid arXiv XML', () => {
    expect(() => parseArxivFeed('<feed><entry>')).toThrow('invalid XML');
  });
});

describe('Hacker News posts', () => {
  const now = Date.parse('2026-10-04T00:00:00Z');
  const hit = {
    objectID: '123', title: 'Agents don\'t need memory', url: 'https://www.example.com/blog/agents',
    points: 338, num_comments: 205, author: 'alice', created_at: '2026-10-03T12:00:00Z',
  };

  it('links to the discussion and keeps the article as a secondary link', () => {
    const card = normalizePost(hit, now);
    expect(card).toMatchObject({
      id: 'hn:123', source: 'hackernews', section: 'posts', type: 'Post',
      url: 'https://news.ycombinator.com/item?id=123', openLabel: 'Discuss',
      metricValue: '338 pts',
    });
    expect(card.links).toEqual([{ id: 'article', label: 'Article', url: 'https://www.example.com/blog/agents', source: 'web' }]);
    expect(card.tags).toEqual(['Hacker News', 'example.com']);
    expect(card.details.hotScore).toBeGreaterThan(0);
  });

  it('handles text posts without an article URL and strips markup from text', () => {
    const card = normalizePost({ ...hit, url: null, story_text: '<p>Ask HN: <i>how</i> do you eval agents?</p>' }, now);
    expect(card.links).toEqual([]);
    expect(card.summary).toBe('Ask HN: how do you eval agents?');
  });

  it('drops unsafe article URLs', () => {
    expect(normalizePost({ ...hit, url: 'javascript:alert(1)' }, now).links).toEqual([]);
  });

  it('recognizes AI titles without matching unrelated words', () => {
    expect(isAiPost(normalizePost(hit, now))).toBe(true);
    expect(isAiPost(normalizePost({ ...hit, title: 'Show HN: Claude-powered CLI' }, now))).toBe(true);
    expect(isAiPost(normalizePost({ ...hit, title: 'Why I stopped using Kubernetes', url: 'https://example.com' }, now))).toBe(false);
    expect(isAiPost(normalizePost({ ...hit, title: 'Rain on the sidewalk' }, now))).toBe(false);
  });
});

describe('Reddit posts', () => {
  const post = {
    name: 't3_abc', title: 'Qwen release thread', permalink: '/r/LocalLLaMA/comments/abc/qwen_release/',
    url: 'https://huggingface.co/Qwen/x', domain: 'huggingface.co', is_self: false, score: 1200,
    num_comments: 340, subreddit: 'LocalLLaMA', author: 'ann', created_utc: 1790000000,
    link_flair_text: 'New Model',
  };

  it('opens the Reddit thread and keeps an external article as a secondary link', () => {
    const card = normalizeRedditPost(post);
    expect(card).toMatchObject({
      id: 'reddit:t3_abc', source: 'reddit', section: 'posts', type: 'Post', openLabel: 'Discuss',
      url: 'https://www.reddit.com/r/LocalLLaMA/comments/abc/qwen_release',
      metricValue: '1.2k pts',
      facts: [{ value: '340', label: 'comments' }],
    });
    expect(card.links).toEqual([{ id: 'article', label: 'Article', url: 'https://huggingface.co/Qwen/x', source: 'web' }]);
    expect(card.tags).toEqual(['r/LocalLLaMA', 'New Model', 'huggingface.co']);
    expect(card.secondary.left).toBe('r/LocalLLaMA · u/ann');
  });

  it('treats self posts and Reddit-hosted links as discussion only', () => {
    const self = normalizeRedditPost({ ...post, is_self: true, domain: 'self.LocalLLaMA', url: 'https://www.reddit.com/r/x', selftext: 'Plain **text** body' });
    expect(self.links).toEqual([]);
    expect(self.summary).toBe('Plain **text** body');
    expect(normalizeRedditPost({ ...post, url: 'https://i.redd.it/pic.png' }).links).toEqual([]);
    expect(normalizeRedditPost({ ...post, url: 'https://www.reddit.com/gallery/abc' }).links).toEqual([]);
  });

  it('rejects unsafe article URLs and drops a permalink that is not a path', () => {
    expect(normalizeRedditPost({ ...post, url: 'javascript:alert(1)' }).links).toEqual([]);
    expect(normalizeRedditPost({ ...post, permalink: 'https://evil.example/x' }).url).toBe('https://www.reddit.com');
  });

  it('filters pinned, removed, adult, and incomplete posts', () => {
    expect(isUsableRedditPost(post)).toBe(true);
    expect(isUsableRedditPost({ ...post, stickied: true })).toBe(false);
    expect(isUsableRedditPost({ ...post, over_18: true })).toBe(false);
    expect(isUsableRedditPost({ ...post, removed_by_category: 'moderator' })).toBe(false);
    expect(isUsableRedditPost({ ...post, title: '' })).toBe(false);
    expect(isUsableRedditPost(null)).toBe(false);
  });
});
