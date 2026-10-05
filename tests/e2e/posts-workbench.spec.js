import { expect, test } from '@playwright/test';

const now = Math.floor(Date.now() / 1000);
const iso = (hoursAgo) => new Date((now - hoursAgo * 3600) * 1000).toISOString();

const hits = [
  { objectID: '1', title: 'Small but fresh LLM tool', url: 'https://example.com/fresh', points: 40, num_comments: 3, author: 'ann', created_at: iso(1) },
  { objectID: '2', title: 'Big old Claude agents debate', url: 'https://example.org/old', points: 300, num_comments: 210, author: 'bob', created_at: iso(30) },
  { objectID: '3', title: 'Why I stopped using Kubernetes', url: 'https://example.net/k8s', points: 900, num_comments: 400, author: 'cy', created_at: iso(2) },
  { objectID: '4', title: 'Ask HN: How do you evaluate AI agents?', url: null, story_text: '<p>Looking for <i>real</i> setups.</p>', points: 90, num_comments: 55, author: 'di', created_at: iso(5) },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('scout-lab:test-initialized')) return;
    localStorage.clear();
    localStorage.setItem('scout-lab:data-schema', '2');
    localStorage.setItem('scout-lab:settings', JSON.stringify({
      selectedSection: 'posts',
      filters: { posts: { source: 'hackernews' } },
      preferences: { startupSection: 'last-used', density: 'comfortable', theme: 'dark' },
    }));
    sessionStorage.setItem('scout-lab:test-initialized', 'true');
  });
});

test('Posts shows AI-only Hacker News cards with discussion and article links', async ({ page }) => {
  const requests = [];
  await page.route('https://hn.algolia.com/api/v1/search**', (route) => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hits }) });
  });

  await page.goto('/newtab.html');
  await expect(page.locator('[data-section="posts"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.grid .card')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Why I stopped using Kubernetes' })).toHaveCount(0);
  expect(requests[0].searchParams.get('tags')).toBe('story,front_page');
  await expect(page.getByLabel('Time range')).toHaveCount(0);

  const card = page.locator('.card', { hasText: 'Small but fresh LLM tool' });
  await expect(card.getByRole('link', { name: /Discuss/ })).toHaveAttribute('href', 'https://news.ycombinator.com/item?id=1');
  await expect(card.getByRole('link', { name: 'Article' })).toHaveAttribute('href', 'https://example.com/fresh');
  await expect(page.locator('.card', { hasText: 'Ask HN' }).getByText('Looking for real setups.')).toBeVisible();
});

test('Posts sorts by velocity for Trending and by points for Top', async ({ page }) => {
  const requests = [];
  await page.route('https://hn.algolia.com/api/v1/search**', (route) => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hits }) });
  });
  const titles = () => page.locator('.grid .card h3').allTextContents();

  await page.goto('/newtab.html');
  await expect(page.locator('.grid .card')).toHaveCount(3);

  await page.getByRole('button', { name: 'Trending', exact: true }).click();
  await expect.poll(() => requests.at(-1).searchParams.get('numericFilters')).toMatch(/^created_at_i>\d+,points>=5$/);
  await expect.poll(titles).toEqual([
    'Small but fresh LLM tool', 'Ask HN: How do you evaluate AI agents?', 'Big old Claude agents debate',
  ]);

  await page.getByRole('button', { name: 'Top', exact: true }).click();
  await expect(page.getByLabel('Time range')).toBeVisible();
  await expect.poll(titles).toEqual([
    'Big old Claude agents debate', 'Ask HN: How do you evaluate AI agents?', 'Small but fresh LLM tool',
  ]);
  await page.getByLabel('Time range').selectOption('month');
  await expect.poll(() => requests.at(-1).searchParams.get('numericFilters')).toMatch(/^created_at_i>\d+,points>=20$/);
});

test('Posts shows a fallback card when Hacker News is unreachable', async ({ page }) => {
  await page.route('https://hn.algolia.com/api/v1/search**', (route) => route.fulfill({ status: 503, body: 'down' }));
  await page.goto('/newtab.html');
  await expect(page.getByRole('heading', { name: 'AI posts on Hacker News' })).toBeVisible();
});

const redditPost = (id, extra = {}) => ({
  name: `t3_${id}`, title: `Reddit post ${id}`, permalink: `/r/LocalLLaMA/comments/${id}/slug/`,
  url: `https://example.com/${id}`, domain: 'example.com', is_self: false, score: 100 + id.length,
  num_comments: 12, subreddit: 'LocalLLaMA', author: 'ann', created_utc: now - 3600, ...extra,
});

const listing = (children) => ({ data: { children: children.map((data) => ({ kind: 't3', data })) } });

test.describe('Reddit source', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('scout-lab:reddit-initialized')) return;
      localStorage.setItem('scout-lab:settings', JSON.stringify({
        selectedSection: 'posts',
        preferences: { startupSection: 'last-used', density: 'comfortable', theme: 'dark' },
      }));
      sessionStorage.setItem('scout-lab:reddit-initialized', 'true');
    });
  });

  test('Posts defaults to Reddit and skips pinned and NSFW posts', async ({ page }) => {
    const requests = [];
    await page.route('https://www.reddit.com/r/**', (route) => {
      requests.push(new URL(route.request().url()));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(listing([
          redditPost('a'), redditPost('bb', { is_self: true, selftext: 'Self text body', url: 'https://www.reddit.com/x' }),
          redditPost('pinned', { stickied: true }), redditPost('adult', { over_18: true }),
        ])),
      });
    });

    await page.goto('/newtab.html');
    await expect(page.locator('.grid .card')).toHaveCount(2);
    expect(requests[0].pathname).toBe('/r/LocalLLaMA+MachineLearning+artificial+OpenAI+ClaudeAI+LLMDevs+StableDiffusion/hot.json');
    await expect(page.getByLabel('Subreddit')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rising', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Trending', exact: true })).toHaveCount(0);

    const card = page.locator('.card', { hasText: 'Reddit post a' });
    await expect(card.getByRole('link', { name: /Discuss/ })).toHaveAttribute('href', 'https://www.reddit.com/r/LocalLLaMA/comments/a/slug');
    await expect(card.getByRole('link', { name: 'Article' })).toHaveAttribute('href', 'https://example.com/a');
    await expect(page.locator('.card', { hasText: 'Self text body' }).getByRole('link', { name: 'Article' })).toHaveCount(0);
  });

  test('Reddit sorts, time range, and subreddit map to the right feed', async ({ page }) => {
    const requests = [];
    await page.route('https://www.reddit.com/r/**', (route) => {
      requests.push(new URL(route.request().url()));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(listing([redditPost('a')])) });
    });

    await page.goto('/newtab.html');
    await expect(page.locator('.grid .card')).toHaveCount(1);
    await expect(page.getByLabel('Time range')).toHaveCount(0);

    await page.getByRole('button', { name: 'Rising', exact: true }).click();
    await expect.poll(() => requests.at(-1).pathname).toMatch(/\/rising\.json$/);

    await page.getByRole('button', { name: 'Top', exact: true }).click();
    await expect(page.getByLabel('Time range')).toBeVisible();
    await expect.poll(() => requests.at(-1).searchParams.get('t')).toBe('week');

    await page.getByLabel('Subreddit').selectOption('OpenAI');
    await expect.poll(() => requests.at(-1).pathname).toBe('/r/OpenAI/top.json');
    await page.getByLabel('Time range').selectOption('month');
    await expect.poll(() => requests.at(-1).searchParams.get('t')).toBe('month');
  });

  test('switching to Hacker News resets the sort and hides the subreddit selector', async ({ page }) => {
    await page.route('https://www.reddit.com/r/**', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(listing([redditPost('a')])),
    }));
    const hnRequests = [];
    await page.route('https://hn.algolia.com/api/v1/search**', (route) => {
      hnRequests.push(new URL(route.request().url()));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hits }) });
    });

    await page.goto('/newtab.html');
    await page.getByRole('button', { name: 'Rising', exact: true }).click();
    await page.getByRole('button', { name: 'Hacker News', exact: true }).click();

    await expect(page.getByLabel('Subreddit')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Hot', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Trending', exact: true })).toBeVisible();
    expect(hnRequests[0].searchParams.get('tags')).toBe('story,front_page');
  });

  test('Settings controls which subreddits All my subreddits covers', async ({ page }) => {
    const requests = [];
    await page.route('https://www.reddit.com/r/**', (route) => {
      requests.push(new URL(route.request().url()));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(listing([redditPost('a')])) });
    });

    await page.goto('/newtab.html');
    await expect(page.locator('.grid .card')).toHaveCount(1);

    await page.locator('[data-command="open-settings"]').first().click();
    const field = page.getByLabel('Subreddits covered by Posts');
    await field.fill('r/OpenAI, ClaudeAI, bad-name');
    await field.press('Tab');

    await expect.poll(() => requests.at(-1).pathname).toBe('/r/OpenAI+ClaudeAI/hot.json');
    await expect(page.getByLabel('Subreddits covered by Posts')).toHaveValue('OpenAI, ClaudeAI');

    await page.getByLabel('Subreddits covered by Posts').fill('');
    await page.getByLabel('Subreddits covered by Posts').press('Tab');
    await expect(page.getByLabel('Subreddits covered by Posts')).toHaveValue(/LocalLLaMA, MachineLearning/);
  });

  test('Reddit blocking the request shows a fallback card', async ({ page }) => {
    await page.route('https://www.reddit.com/r/**', (route) => route.fulfill({ status: 403, body: 'blocked' }));
    await page.goto('/newtab.html');
    await expect(page.getByRole('heading', { name: 'AI communities on Reddit' })).toBeVisible();
  });
});
