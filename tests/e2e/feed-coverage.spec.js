import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route('https://www.reddit.com/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ data: { children: [] } }),
  }));
  await context.route('https://hn.algolia.com/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ hits: [], nbHits: 0, nbPages: 0 }),
  }));
});

const openSection = (page, section) => page.addInitScript((selectedSection) => {
  localStorage.clear();
  localStorage.setItem('scout-lab:data-schema', '2');
  localStorage.setItem('scout-lab:settings', JSON.stringify({
    selectedSection,
    preferences: { startupSection: selectedSection },
  }));
}, section);

const trendingRow = (index) => `
  <article class="Box-row">
    <h2><a href="/owner-${index}/repo-${index}">owner-${index} / repo-${index}</a></h2>
    <p>Repository number ${index}.</p>
    <span itemprop="programmingLanguage">Python</span>
    <a href="/owner-${index}/repo-${index}/stargazers">${1000 - index}</a>
    <a href="/owner-${index}/repo-${index}/forks">${index}</a>
    <span>${500 - index} stars today</span>
  </article>`;

test('Code shows every repository on the Trending page, including the 25th', async ({ page }) => {
  await openSection(page, 'code');
  await page.route('**/__scout/github-trending**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<html><body>${Array.from({ length: 25 }, (_, index) => trendingRow(index + 1)).join('')}</body></html>`,
  }));

  await page.goto('/newtab.html');

  await expect(page.locator('.grid .card')).toHaveCount(25);
  await expect(page.getByRole('heading', { name: 'owner-25/repo-25' })).toBeVisible();
  await expect(page.getByText('25 repositories', { exact: false }).first()).toBeVisible();
});

test('Models lists every family Hugging Face returned instead of stopping at 24', async ({ page }) => {
  await openSection(page, 'models');
  const models = Array.from({ length: 60 }, (_, index) => ({
    id: `org/model-${index}`, downloads: 1000 - index, likes: 10, trendingScore: 100 - index, tags: [],
  }));
  let limit = '';
  await page.route('https://huggingface.co/api/models**', (route) => {
    limit = new URL(route.request().url()).searchParams.get('limit');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(models) });
  });
  await page.route('https://huggingface.co/**/raw/main/README.md', (route) => route.fulfill({ status: 404, body: '' }));

  await page.goto('/newtab.html');

  await expect(page.locator('.grid .card')).toHaveCount(60);
  expect(limit).toBe('100');
});
