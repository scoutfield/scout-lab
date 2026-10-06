import { expect, test } from '@playwright/test';

const iso = (hours) => new Date(Date.now() - hours * 3600_000).toISOString();
const hits = () => [
  { objectID: '1', title: 'Small but fresh LLM tool', url: 'https://example.com/fresh', points: 40, num_comments: 3, author: 'ann', created_at: iso(1) },
  { objectID: '2', title: 'Big old Claude agents debate', url: 'https://example.org/old', points: 300, num_comments: 210, author: 'bob', created_at: iso(30) },
  { objectID: '3', title: 'Why I stopped using Kubernetes', url: 'https://example.net/k8s', points: 900, num_comments: 400, author: 'cy', created_at: iso(2) },
  { objectID: '4', title: 'Ask HN: How do you evaluate AI agents?', url: null, story_text: '<p>Looking for <i>real</i> setups.</p>', points: 90, num_comments: 55, author: 'di', created_at: iso(5) },
  { objectID: '5', title: 'New text-to-video model', url: 'https://example.com/video', points: 20, num_comments: 20, created_at: iso(2) },
  { objectID: '6', title: 'Travel agents are disappearing', points: 100, num_comments: 80, created_at: iso(1) },
];

const mockPosts = async (page, requests = []) => {
  const data = hits();
  await page.route('https://hn.algolia.com/api/v1/search**', (route) => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hits: data, nbPages: 1 }) });
  });
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('scout-lab:test-initialized')) return;
    localStorage.clear();
    localStorage.setItem('scout-lab:data-schema', '2');
    localStorage.setItem('scout-lab:settings', JSON.stringify({
      selectedSection: 'posts',
      preferences: {
        startupSection: 'last-used', density: 'comfortable', theme: 'dark',
        todayMix: { code: 0, models: 0, datasets: 0, papers: 0, posts: 2 },
      },
    }));
    sessionStorage.setItem('scout-lab:test-initialized', 'true');
  });
  await page.route('https://huggingface.co/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/__scout/github-trending**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
  await page.route('**/__scout/arxiv**', (route) => route.fulfill({ status: 200, contentType: 'application/atom+xml', body: '<feed></feed>' }));
});

test('Posts is one deduplicated, age-ranked feed with discussion and article links', async ({ page }) => {
  const requests = []; await mockPosts(page, requests);
  await page.goto('/newtab.html');
  await expect(page.locator('[data-section="posts"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.grid .card')).toHaveCount(4);
  await expect(page.locator('.grid .card h3')).toHaveText([
    'Small but fresh LLM tool', 'Ask HN: How do you evaluate AI agents?', 'New text-to-video model', 'Big old Claude agents debate',
  ]);
  for (const name of ['Hot', 'Trending', 'Top']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Time range')).toBeVisible();
  expect(requests.map((url) => url.pathname)).toEqual(expect.arrayContaining(['/api/v1/search', '/api/v1/search_by_date']));
  expect(requests[0].searchParams.has('query')).toBe(false);
  const card = page.locator('.card', { hasText: 'Small but fresh LLM tool' });
  await expect(card.getByRole('link', { name: /Discuss/ })).toHaveAttribute('href', 'https://news.ycombinator.com/item?id=1');
  await expect(card.getByRole('link', { name: 'Article' })).toHaveAttribute('href', 'https://example.com/fresh');
  await expect(page.locator('.card', { hasText: 'Ask HN' }).getByText('Looking for real setups.')).toBeVisible();
});

test('Posts combines engagement, topic, and rolling time filters', async ({ page }) => {
  const requests = []; await mockPosts(page, requests);
  await page.goto('/newtab.html');
  await expect(page.locator('.grid .card')).toHaveCount(4);
  await page.getByLabel('Minimum points', { exact: true }).selectOption('50');
  await expect(page.locator('.grid .card')).toHaveCount(2);
  await page.getByLabel('Minimum comments', { exact: true }).selectOption('50');
  await expect(page.locator('.grid .card')).toHaveCount(2);
  await page.getByLabel('Time range', { exact: true }).selectOption('day');
  await expect(page.locator('.grid .card')).toHaveCount(1);
  await expect(page.locator('.grid h3')).toHaveText('Ask HN: How do you evaluate AI agents?');
  await page.getByLabel('AI topic', { exact: true }).selectOption('multimodal');
  await expect(page.locator('.grid .card')).toHaveCount(0);
  await expect(page.getByText('No items match these filters.', { exact: true })).toBeVisible();
  expect(requests.at(-1).searchParams.get('numericFilters')).toMatch(/^created_at_i>\d+,points>=50,num_comments>=50$/);
});

test('Settings edits and persists Posts defaults, applies them, and restores factory values', async ({ page }) => {
  await mockPosts(page); await page.goto('/newtab.html');
  await expect(page.locator('.grid .card')).toHaveCount(4);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Default Posts minimum points').selectOption('50');
  await page.getByLabel('Default Posts minimum comments').selectOption('20');
  await page.getByLabel('Default Posts time range').selectOption('day');
  await page.getByLabel('Default Posts ai topic').selectOption('agents');
  await expect(page.getByLabel('Default Posts ai topic')).toBeFocused();
  await page.locator('.drawer-close').click();
  await expect(page.locator('.grid .card')).toHaveCount(1);
  await expect(page.getByLabel('Time range', { exact: true })).toHaveValue('day');
  await page.reload();
  await expect(page.locator('.grid .card')).toHaveCount(1);
  const defaults = await page.evaluate(() => JSON.parse(localStorage.getItem('scout-lab:settings')).filterDefaults.posts);
  expect(defaults).toEqual({ time: 'day', topic: 'agents', minPoints: '50', minComments: '20' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('[data-restore-workbench="posts"]').click();
  await expect(page.getByLabel('Default Posts minimum points')).toHaveValue('0');
  await expect(page.getByLabel('Default Posts time range')).toHaveValue('week');
  await page.locator('.drawer-close').click();
  await expect(page.locator('.grid .card')).toHaveCount(4);
});

test('Today uses Posts filters, replaces hidden posts, and can turn the Posts lane off', async ({ page }) => {
  await mockPosts(page); await page.goto('/newtab.html');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.locator('.grid .card[data-type="Post"]')).toHaveCount(2);
  await page.locator('.card[data-id="hn:1"]').getByRole('button', { name: 'Hide', exact: true }).click();
  await expect(page.locator('.grid .card')).toHaveCount(2);
  await expect(page.locator('.card[data-id="hn:1"]')).toHaveCount(0);
  await expect(page.locator('.card[data-id="hn:5"]')).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Default Posts minimum points').selectOption('100');
  await expect(page.locator('.grid .card')).toHaveCount(1);
  await expect(page.locator('.grid h3')).toHaveText('Big old Claude agents debate');
  // Enable another lane to keep the total valid while setting Posts to zero.
  await page.getByRole('button', { name: 'Add one Code card', exact: true }).click();
  await page.getByRole('button', { name: 'Remove one Posts card', exact: true }).click();
  await page.getByRole('button', { name: 'Remove one Posts card', exact: true }).click();
  await expect(page.locator('[data-today-lane="posts"] output')).toHaveText('0');
  await page.locator('.drawer-close').click();
  await expect(page.locator('.grid .card[data-type="Post"]')).toHaveCount(0);
});

test('feed defaults, restore-all, and preference reset keep Posts consistent without deleting favorites', async ({ page }) => {
  await mockPosts(page); await page.goto('/newtab.html');
  await page.locator('.card[data-id="hn:1"]').getByRole('button', { name: 'Favorite', exact: true }).click();
  await page.getByLabel('Minimum points', { exact: true }).selectOption('100');
  await expect(page.locator('.grid .card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save as default', exact: true }).click();
  await page.getByLabel('Minimum points', { exact: true }).selectOption('0');
  await expect(page.locator('.grid .card')).toHaveCount(4);
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(page.getByLabel('Minimum points', { exact: true })).toHaveValue('100');
  await expect(page.locator('.grid .card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Default Posts minimum points')).toHaveValue('100');
  await page.locator('[data-command="restore-all-filter-defaults"]').click();
  await expect(page.getByLabel('Default Posts minimum points')).toHaveValue('0');
  await expect(page.locator('.grid .card')).toHaveCount(4);
  await page.getByLabel('Default Posts minimum points').selectOption('100');
  await page.locator('[data-command="request-reset-preferences"]').click();
  await page.locator('[data-command="confirm-reset-preferences"]').click();
  await expect(page.getByLabel('Default Posts minimum points')).toHaveValue('0');
  await expect(page.locator('[data-today-lane="posts"] output')).toHaveText('2');
  await page.locator('.drawer-close').click();
  await expect(page.locator('.grid .card')).toHaveCount(4);
  await expect(page.locator('.card[data-id="hn:1"]').getByRole('button', { name: 'Favorite', exact: true })).toHaveClass(/active/);
});

test('favorite and note survive reload and Library keeps the article link', async ({ page }) => {
  await mockPosts(page); await page.goto('/newtab.html');
  const card = page.locator('.card[data-id="hn:1"]');
  await card.getByRole('button', { name: 'Favorite', exact: true }).click();
  await card.getByRole('button', { name: 'Comment', exact: true }).click();
  await card.getByRole('textbox').fill('Useful idea to revisit');
  await card.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.reload();
  await expect(card.getByText('Useful idea to revisit')).toBeVisible();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByLabel('Content type', { exact: true }).selectOption('Post');
  await expect(card).toBeVisible();
  await expect(card.getByRole('link', { name: 'Article', exact: true })).toHaveAttribute('href', 'https://example.com/fresh');
});

test('Posts and Settings fit a mobile viewport', async ({ page }) => {
  await mockPosts(page); await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/newtab.html'); await expect(page.locator('.grid .card')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Default Posts minimum comments')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Posts shows a labeled fallback when Hacker News is unreachable', async ({ page }) => {
  await page.route('https://hn.algolia.com/api/v1/search**', (route) => route.fulfill({ status: 503, body: 'down' }));
  await page.goto('/newtab.html');
  await expect(page.getByRole('heading', { name: 'AI posts on Hacker News' })).toBeVisible();
});
