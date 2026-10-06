import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route('https://www.reddit.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { children: [] } }) }));
});

const models = [
  {
    id: 'Qwen/Qwen-7B', pipeline_tag: 'text-generation', tags: ['transformers'],
    downloads: 2000, likes: 200, trendingScore: 90, gated: false,
    createdAt: '2026-08-20T00:00:00Z', lastModified: '2026-08-28T00:00:00Z',
  },
  {
    id: 'openai/scout-vision', pipeline_tag: 'image-text-to-text', tags: ['transformers'],
    downloads: 900, likes: 90, trendingScore: 70, gated: false,
    createdAt: '2026-07-01T00:00:00Z', lastModified: '2026-07-02T00:00:00Z',
  },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('scout-library-test')) return;
    localStorage.clear();
    localStorage.setItem('scout-lab:data-schema', '2');
    localStorage.setItem('scout-lab:settings', JSON.stringify({
      selectedSection: 'models',
      preferences: { startupSection: 'last-used', density: 'comfortable', theme: 'dark' },
    }));
    sessionStorage.setItem('scout-library-test', 'ready');
  });
});

test('Library automatically preserves and reviews favorites and comments', async ({ page }) => {
  let modelRequests = 0;
  await page.route('https://huggingface.co/api/models**', (route) => {
    modelRequests += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(models) });
  });

  await page.goto('/newtab.html');
  const qwen = page.locator('[data-id="hf-model:Qwen/Qwen-7B"]');
  const vision = page.locator('[data-id="hf-model:openai/scout-vision"]');
  await qwen.getByRole('button', { name: 'Favorite' }).click();
  await vision.getByRole('button', { name: 'Comment' }).click();
  await vision.getByLabel('Comment for openai/scout-vision').fill('Compare its visual reasoning quality.');
  await vision.getByRole('button', { name: 'Save note' }).click();
  await qwen.getByRole('button', { name: 'Hide' }).click();

  const beforeLibrary = modelRequests;
  await page.getByRole('button', { name: /Library/ }).click();
  expect(modelRequests).toBe(beforeLibrary);
  await expect(page.locator('.grid .card')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Qwen/Qwen-7B' })).toBeVisible();
  await expect(page.getByText('Compare its visual reasoning quality.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Favorites', exact: true }).click();
  await expect(page.locator('.grid .card')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Qwen/Qwen-7B' })).toBeVisible();
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.locator('.grid .card')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'openai/scout-vision' })).toBeVisible();

  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByLabel('Content type').selectOption('Code');
  await expect(page.getByText('No items match these filters.')).toBeVisible();
  await expect(page.locator('.library-empty')).toHaveCount(0);
  await page.getByLabel('Content type').selectOption('all');
  await page.getByLabel('Source').selectOption('github');
  await expect(page.getByText('No items match these filters.')).toBeVisible();
  await page.getByLabel('Source').selectOption('all');
  await page.getByLabel('Sort').selectOption('title');
  await expect(page.locator('.grid .card h3').allTextContents()).resolves.toEqual(['openai/scout-vision', 'Qwen/Qwen-7B']);
  await page.getByLabel('Search this tab').fill('Qwen');
  await expect(page.locator('.grid .card')).toHaveCount(1);
  await page.getByLabel('Search this tab').fill('');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Qwen/Qwen-7B' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'openai/scout-vision' })).toBeVisible();

  await page.locator('[data-id="hf-model:Qwen/Qwen-7B"]').getByRole('button', { name: 'Favorite' }).click();
  await expect(page.getByRole('heading', { name: 'Qwen/Qwen-7B' })).toHaveCount(0);
  const savedVision = page.locator('[data-id="hf-model:openai/scout-vision"]');
  await savedVision.getByRole('button', { name: 'Comment' }).click();
  await savedVision.getByLabel('Comment for openai/scout-vision').fill('');
  await savedVision.getByRole('button', { name: 'Save note' }).click();
  await expect(page.locator('.library-empty')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
