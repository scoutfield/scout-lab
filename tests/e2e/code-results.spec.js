import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route('https://www.reddit.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { children: [] } }) }));
});

const trendingHtml = await readFile(resolve(process.cwd(), 'tests', 'fixtures', 'github-trending.html'), 'utf8');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('scout-lab:data-schema', '2');
    localStorage.setItem('scout-lab:settings', JSON.stringify({
      selectedSection: 'code',
      preferences: { startupSection: 'code' },
    }));
  });
});

test('Code renders the exact Trending order and three GitHub-native filters', async ({ page }) => {
  let apiCalls = 0;
  await page.route('**/__scout/github-trending**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: trendingHtml,
  }));
  await page.route('https://api.github.com/**', (route) => {
    apiCalls += 1;
    return route.abort('blockedbyclient');
  });

  await page.goto('/newtab.html');

  await expect(page.getByRole('heading', { name: 'Code', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Mode' })).toHaveCount(0);
  await expect(page.getByLabel('Time range')).toBeVisible();
  await expect(page.getByLabel('Spoken language')).toBeVisible();
  await expect(page.getByLabel('Language', { exact: true })).toBeVisible();
  await expect(page.getByLabel('AI topic')).toHaveCount(0);
  await expect(page.getByLabel('Time range')).toHaveValue('day');
  await expect(page.locator('.grid .card h3')).toHaveText([
    'example-labs/agent-kit',
    'signal-org/eval-workbench',
  ]);
  await expect(page.locator('.grid .card .metric')).toHaveText(['+373', '+120']);
  await expect(page.locator('.feed-status')).toContainText('GitHub Trending');
  await expect(page.locator('.feed-status')).toContainText('Live');
  await expect(page.getByRole('link', { name: 'Open on GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/trending?since=daily',
  );
  expect(apiCalls).toBe(0);
});

test('Code shows README prose when GitHub Trending has no description', async ({ page }) => {
  const withoutDescription = trendingHtml.replace(
    '<p class="col-9 color-fg-muted my-1 pr-4">A useful toolkit for building reliable AI agents.</p>',
    '',
  );
  await page.route('**/__scout/github-trending**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: withoutDescription,
  }));
  await page.route('https://github.com/example-labs/agent-kit', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<article class="markdown-body"><p>A clear README description for the agent toolkit.</p></article>',
  }));

  await page.goto('/newtab.html');

  await expect(page.locator('[data-id="github:example-labs/agent-kit"]'))
    .toContainText('A clear README description for the agent toolkit.');
});

test('English and Chinese map to GitHub spoken_language_code', async ({ page }) => {
  const spokenLanguages = [];
  await page.route('**/__scout/github-trending**', (route) => {
    spokenLanguages.push(new URL(route.request().url()).searchParams.get('spoken_language_code'));
    return route.fulfill({ status: 200, contentType: 'text/html', body: trendingHtml });
  });

  await page.goto('/newtab.html');
  await page.getByLabel('Spoken language').selectOption('en');
  await page.getByLabel('Spoken language').selectOption('zh');

  await expect(page.getByLabel('Spoken language')).toHaveValue('zh');
  expect(spokenLanguages).toEqual([null, 'en', 'zh']);
});

test('Code shows an honest unavailable state and never requests Search', async ({ page }) => {
  let apiCalls = 0;
  await page.route('**/__scout/github-trending**', (route) => route.fulfill({
    status: 502,
    contentType: 'text/plain',
    body: 'Upstream unavailable',
  }));
  await page.route('https://api.github.com/**', (route) => {
    apiCalls += 1;
    return route.abort('blockedbyclient');
  });

  await page.goto('/newtab.html');

  await expect(page.locator('.grid .card')).toHaveCount(0);
  await expect(page.locator('.source-unavailable')).toBeVisible();
  await expect(page.getByText('GitHub Trending is unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open GitHub Trending' })).toHaveAttribute(
    'href',
    'https://github.com/trending?since=daily',
  );
  expect(apiCalls).toBe(0);
});

test('Code ignores a legacy Search-backed cache entry', async ({ page }) => {
  await page.addInitScript(() => {
    const query = '{"filters":{"language":"all","spokenLanguage":"all","time":"day"},"section":"code"}';
    localStorage.setItem(`scout-lab:cache:v4:${query}`, JSON.stringify({
      cards: [{
        id: 'github:old/search-result',
        source: 'github',
        section: 'code',
        type: 'Code',
        title: 'old/search-result',
        url: 'https://github.com/old/search-result',
      }],
      status: { label: 'GitHub search fallback', stale: true },
      expiresAt: Date.now() + 60_000,
      savedAt: new Date().toISOString(),
    }));
  });
  await page.route('**/__scout/github-trending**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: trendingHtml,
  }));

  await page.goto('/newtab.html');

  await expect(page.getByRole('heading', { name: 'old/search-result' })).toHaveCount(0);
  await expect(page.locator('.grid .card h3')).toHaveText([
    'example-labs/agent-kit',
    'signal-org/eval-workbench',
  ]);
});

test('Code reuses a current completed cache entry on startup', async ({ page }) => {
  let requests = 0;
  await page.addInitScript(() => {
    const query = '{"filters":{"language":"all","spokenLanguage":"all","time":"day"},"section":"code","sourceRevision":"github-trending-v4"}';
    localStorage.setItem(`scout-lab:cache:v4:${query}`, JSON.stringify({
      cards: [{
        id: 'github:cached/repository',
        source: 'github',
        section: 'code',
        type: 'Code',
        title: 'cached/repository',
        url: 'https://github.com/cached/repository',
      }],
      status: { label: 'GitHub Trending', sourceRevision: 'github-trending-v4' },
      expiresAt: Date.now() + 60_000,
      savedAt: new Date().toISOString(),
    }));
  });
  await page.route('**/__scout/github-trending**', (route) => {
    requests += 1;
    return route.fulfill({ status: 200, contentType: 'text/html', body: trendingHtml });
  });

  await page.goto('/newtab.html');

  await expect(page.getByRole('heading', { name: 'cached/repository' })).toBeVisible();
  expect(requests).toBe(0);
});

test('Code refreshes an expired current cache entry on startup', async ({ page }) => {
  let requests = 0;
  await page.addInitScript(() => {
    const query = '{"filters":{"language":"all","spokenLanguage":"all","time":"day"},"section":"code","sourceRevision":"github-trending-v4"}';
    localStorage.setItem(`scout-lab:cache:v4:${query}`, JSON.stringify({
      cards: [{
        id: 'github:expired/repository',
        source: 'github',
        section: 'code',
        type: 'Code',
        title: 'expired/repository',
        url: 'https://github.com/expired/repository',
      }],
      status: { label: 'GitHub Trending', sourceRevision: 'github-trending-v4' },
      expiresAt: Date.now() - 1,
      savedAt: new Date(Date.now() - (7 * 60 * 60 * 1000)).toISOString(),
    }));
  });
  await page.route('**/__scout/github-trending**', (route) => {
    requests += 1;
    return route.fulfill({ status: 200, contentType: 'text/html', body: trendingHtml });
  });

  await page.goto('/newtab.html');

  await expect(page.getByRole('heading', { name: 'expired/repository' })).toHaveCount(0);
  await expect(page.locator('.grid .card h3')).toHaveText([
    'example-labs/agent-kit',
    'signal-org/eval-workbench',
  ]);
  expect(requests).toBe(1);
});

test('Code requests live data again when refreshed', async ({ page }) => {
  let requests = 0;
  await page.route('**/__scout/github-trending**', (route) => {
    requests += 1;
    return route.fulfill({ status: 200, contentType: 'text/html', body: trendingHtml });
  });

  await page.goto('/newtab.html');
  await expect(page.locator('.grid .card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect.poll(() => requests).toBe(2);
});

test('Code filters and cards remain usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/__scout/github-trending**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: trendingHtml,
  }));

  await page.goto('/newtab.html');

  await expect(page.getByLabel('Spoken language')).toBeVisible();
  await expect(page.getByLabel('Language', { exact: true })).toBeVisible();
  await expect(page.locator('.grid .card')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
