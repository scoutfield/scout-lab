import {
  buildArxivUrl,
  buildCommunityPapersUrl,
  buildDatasetsUrl,
  buildDatasetsRequest,
  buildGithubRequest,
  buildModelsUrl,
  buildPostsUrl,
  buildRedditPostsUrl,
} from '../src/services/query.js';
import { parseGithubTrending, parseHuggingFaceDatasetsPage } from '../src/services/normalizers.js';
import { createDefaultFilters } from '../src/workbenches.js';
import { JSDOM } from 'jsdom';

const TIMEOUT = 15_000;
const checks = [];

const fetchChecked = async (url, options = {}) => {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response;
};

const record = async (name, task) => {
  try {
    const detail = await task();
    checks.push({ name, ok: true, detail });
    return detail;
  } catch (error) {
    checks.push({ name, ok: false, detail: error.message });
    return null;
  }
};

const defaults = createDefaultFilters();
globalThis.DOMParser = new JSDOM('').window.DOMParser;

const trendingContract = (name, filters) => record(name, async () => {
  const response = await fetchChecked(buildGithubRequest(filters).url);
  const html = await response.text();
  const periodLabel = { day: 'today', week: 'this week', month: 'this month' }[filters.time];
  const document = new JSDOM(html).window.document;
  const articles = [...document.querySelectorAll('article.Box-row')];
  const repositoryPaths = articles.map((article) => [...article.querySelectorAll('h2 a')]
    .map((link) => link.getAttribute('href') || '')
    .find((path) => /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(path))
    ?.replace(/^\//, '').replace(/\/$/, ''))
    .filter(Boolean);
  const periodStars = articles.map((article) => [...article.querySelectorAll('span')]
    .map((node) => node.textContent || '')
    .find((text) => new RegExp(`stars?\\s+${periodLabel}`).test(text)))
    .filter(Boolean)
    .map((text) => Number(text.replace(/[^0-9]/g, '')));
  const cards = parseGithubTrending(html, filters.time);
  if (!repositoryPaths.length || !periodStars.length) throw new Error('No parseable repositories or period-star labels');
  if (JSON.stringify(cards.map(({ title }) => title)) !== JSON.stringify(repositoryPaths)) {
    throw new Error('Parser repository order differs from GitHub HTML');
  }
  if (JSON.stringify(cards.map((card) => card.details.periodStars)) !== JSON.stringify(periodStars)) {
    throw new Error('Parser period stars differ from GitHub HTML');
  }
  return {
    entries: cards.length,
    periodLabels: periodStars.length,
    first: cards[0].title,
    links: cards.map((card) => card.url),
  };
});

const trending = await trendingContract('GitHub Trending contract', defaults.code);
const trendingEnglish = await trendingContract('GitHub Trending English contract', {
  ...defaults.code,
  time: 'day',
  spokenLanguage: 'en',
});
const trendingChinese = await trendingContract('GitHub Trending Chinese contract', {
  ...defaults.code,
  time: 'month',
  spokenLanguage: 'zh',
});

const models = await record('Hugging Face models contract', async () => {
  const response = await fetchChecked(buildModelsUrl(defaults.models));
  const data = await response.json();
  if (!data.length || !Number.isFinite(data[0].trendingScore) || !Number.isFinite(data[0].downloads)) {
    throw new Error('Missing trending or download metrics');
  }
  return { entries: data.length, links: data.map((item) => `https://huggingface.co/${item.id}`) };
});

const datasets = await record('Hugging Face datasets contract', async () => {
  const response = await fetchChecked(buildDatasetsUrl(defaults.datasets));
  const data = await response.json();
  if (!data.length || !Number.isFinite(data[0].trendingScore) || !Number.isFinite(data[0].downloads)) {
    throw new Error('Missing trending or download metrics');
  }
  return { entries: data.length, links: data.map((item) => `https://huggingface.co/datasets/${item.id}`) };
});

await record('Hugging Face dataset sort contract', async () => {
  const sorts = [
    'trending', 'likes', 'downloads', 'created', 'updated', 'most-rows', 'least-rows',
    'largest-size', 'smallest-size',
  ];
  const results = [];
  for (const rank of sorts) {
    const request = buildDatasetsRequest({ ...defaults.datasets, rank });
    const response = await fetchChecked(request.url, {
      headers: { Accept: request.kind === 'page' ? 'text/html' : 'application/json' },
    });
    const data = request.kind === 'page'
      ? parseHuggingFaceDatasetsPage(await response.text())
      : await response.json();
    if (!Array.isArray(data) || !data.length || !(data[0].id || data[0]._id)) {
      throw new Error(`${rank} returned no datasets`);
    }
    results.push({ rank, kind: request.kind, first: data[0].id || data[0]._id });
  }
  return { sorts: results.length, pageBacked: results.filter(({ kind }) => kind === 'page').length };
});

const papers = await record('Hugging Face Daily Papers contract', async () => {
  const response = await fetchChecked(buildCommunityPapersUrl(defaults.papers));
  const data = await response.json();
  const first = data[0];
  if (!first?.paper?.id || !Number.isFinite(first.paper.upvotes) || !Number.isFinite(first.numComments)) {
    throw new Error('Missing paper, upvote, or comment fields');
  }
  return { entries: data.length, links: data.map((item) => `https://huggingface.co/papers/${item.paper.id}`) };
});

const arxiv = await record('arXiv Atom contract', async () => {
  const response = await fetchChecked(buildArxivUrl({ ...defaults.papers, source: 'arxiv', sort: 'newest' }));
  const xml = await response.text();
  const ids = [...xml.matchAll(/<id>https?:\/\/arxiv\.org\/abs\/([^<]+)<\/id>/g)].map((match) => match[1]);
  if (!ids.length || !xml.includes('<author>') || !xml.includes('<category') || !xml.includes('title="pdf"')) {
    throw new Error('Missing entry, author, category, or PDF fields');
  }
  return { entries: ids.length, links: ids.map((id) => `https://arxiv.org/abs/${id}`) };
});

const posts = await record('Hacker News Algolia contract', async () => {
  const results = [];
  for (const rank of ['hot', 'top']) {
    const response = await fetchChecked(buildPostsUrl({ ...defaults.posts, rank }));
    const { hits } = await response.json();
    if (!Array.isArray(hits)) throw new Error(`${rank} returned no hits array`);
    const first = hits[0];
    if (first && (!first.objectID || !first.title || !Number.isFinite(first.points) || !Number.isFinite(first.num_comments))) {
      throw new Error(`${rank} is missing id, title, points, or comments`);
    }
    results.push({ rank, entries: hits.length });
  }
  return { sorts: results };
});

await record('Reddit public JSON contract', async () => {
  const response = await fetch(buildRedditPostsUrl({ ...defaults.posts, rank: 'hot' }, ['LocalLLaMA', 'MachineLearning']), {
    credentials: 'omit', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT),
  });
  // Reddit blocks many datacenter and CI addresses; that says nothing about a user's browser.
  if ([403, 429].includes(response.status)) return { skipped: `blocked from this network (${response.status})` };
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const children = (await response.json())?.data?.children;
  const first = children?.[0]?.data;
  if (!Array.isArray(children) || !first?.permalink || !first.title || !Number.isFinite(first.score)) {
    throw new Error('Missing listing children, title, permalink, or score');
  }
  return { entries: children.length };
});

const linkGroups = [trending, trendingEnglish, trendingChinese, models, datasets, papers, arxiv].filter(Boolean);
const links = [...new Set(linkGroups.flatMap((group) => group.links))];

const rateLimitedHosts = new Set();

const verifyLink = async (url) => {
  const host = new URL(url).hostname;
  if (rateLimitedHosts.has(host)) return { url, status: 429, rateLimited: true };
  let response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT) });
  if ([405, 501].includes(response.status)) {
    response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT) });
    await response.body?.cancel();
  }
  if (response.status === 429) {
    rateLimitedHosts.add(host);
    return { url, status: 429, rateLimited: true };
  }
  if (response.status < 200 || response.status >= 400) throw new Error(`${response.status} ${response.statusText}`);
  return { url, status: response.status, finalUrl: response.url };
};

await record('Rendered destination links', async () => {
  const results = [];
  const failures = [];
  const queue = [...links];
  const worker = async () => {
    while (queue.length) {
      const url = queue.shift();
      try {
        results.push(await verifyLink(url));
      } catch (error) {
        failures.push({ url, error: error.message });
      }
    }
  };
  await worker();
  if (failures.length) throw new Error(`${failures.length} failed: ${JSON.stringify(failures.slice(0, 5))}`);
  return {
    checked: results.length,
    reachable: results.filter((result) => !result.rateLimited).length,
    rateLimited: results.filter((result) => result.rateLimited).length,
  };
});

for (const check of checks) {
  const detail = check.detail?.links ? { ...check.detail, links: check.detail.links.length } : check.detail;
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}: ${JSON.stringify(detail)}`);
}

if (checks.some((check) => !check.ok)) process.exitCode = 1;
