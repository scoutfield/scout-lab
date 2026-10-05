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
