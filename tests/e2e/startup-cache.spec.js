import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route('https://www.reddit.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { children: [] } }) }));
});

const githubHtml = await readFile(resolve(process.cwd(), 'tests', 'fixtures', 'github-trending.html'), 'utf8');
const arxivXml = await readFile(resolve(process.cwd(), 'tests', 'fixtures', 'arxiv.xml'), 'utf8');
const models = [{ id: 'scout/model', downloads: 10, likes: 2, trendingScore: 3, tags: [] }];
const datasets = [{ id: 'scout/dataset', downloads: 20, likes: 4, trendingScore: 5, tags: [] }];
const papers = [{ paper: { id: '2608.10000', title: 'Scout paper', summary: 'Summary', upvotes: 6, authors: [] } }];

test('cold startup warms every remote workbench and later new tabs reuse the cache', async ({ page, context }) => {
  const requests = { github: 0, models: 0, modelReadmes: 0, datasets: 0, community: 0, arxiv: 0, posts: 0 };
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('scout-lab:data-schema', '2');
    localStorage.setItem('scout-lab:settings', JSON.stringify({
      preferences: { startupSection: 'today' },
    }));
  });
  await context.route('**/__scout/github-trending**', (route) => {
    requests.github += 1;
    return route.fulfill({ status: 200, contentType: 'text/html', body: githubHtml });
  });
  await context.route('https://huggingface.co/api/models**', (route) => {
    requests.models += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(models) });
  });
  await context.route('https://huggingface.co/**/raw/main/README.md', (route) => {
    requests.modelReadmes += 1;
    return route.fulfill({
      status: 200,
      contentType: 'text/markdown',
      body: '# Scout model\n\nA model card used to verify startup description caching.',
    });
  });
  await context.route('https://huggingface.co/api/datasets**', (route) => {
    requests.datasets += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(datasets) });
  });
  await context.route('https://huggingface.co/api/daily_papers**', (route) => {
    requests.community += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(papers) });
  });
  await context.route('**/__scout/arxiv**', (route) => {
    requests.arxiv += 1;
    return route.fulfill({ status: 200, contentType: 'application/atom+xml', body: arxivXml });
  });

  await context.route('https://hn.algolia.com/api/v1/search**', (route) => {
    requests.posts += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hits: [
      { objectID: '1', title: 'AI tool', points: 40, num_comments: 5, created_at: new Date(Date.now() - 3600_000).toISOString() },
      { objectID: '2', title: 'LLM tool', points: 20, num_comments: 3, created_at: new Date(Date.now() - 7200_000).toISOString() },
    ], nbPages: 1 }) });
  });

  await page.goto('/newtab.html');
  await expect(page.getByRole('heading', { name: "Today's queue" })).toBeVisible();
  await expect(page.locator('.grid .card')).toHaveCount(8);
  await expect.poll(() => requests).toEqual({
    github: 1, models: 1, modelReadmes: 1, datasets: 1, community: 1, arxiv: 1, posts: 2,
  });

  for (const section of ['Code', 'Models', 'Datasets', 'Papers', 'Posts']) {
    await page.getByRole('button', { name: section, exact: true }).click();
    await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible();
  }

  expect(requests).toEqual({
    github: 1, models: 1, modelReadmes: 1, datasets: 1, community: 1, arxiv: 1, posts: 2,
  });

  const secondNewTab = await context.newPage();
  await secondNewTab.goto('/newtab.html');
  await expect(secondNewTab.getByRole('heading', { name: "Today's queue" })).toBeVisible();
  await secondNewTab.waitForTimeout(100);
  expect(requests).toEqual({
    github: 1, models: 1, modelReadmes: 1, datasets: 1, community: 1, arxiv: 1, posts: 2,
  });
});
