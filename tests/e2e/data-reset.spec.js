import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route('https://www.reddit.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { children: [] } }) }));
});

test('startup wipes pre-schema Scout Lab data before rendering defaults', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('scout-lab:settings', JSON.stringify({
      selectedSection: 'learn',
      preferences: { startupSection: 'learn', theme: 'dark' },
    }));
    localStorage.setItem('scout-lab:user-state', JSON.stringify({
      'learn:legacy': { favorite: true, comment: 'remove me' },
    }));
    localStorage.setItem('other-product:data', 'keep me');
  });

  await page.goto('/newtab.html');

  await expect(page.getByRole('heading', { name: "Today's queue" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('scout-lab:data-schema'))).toBe('2');
  expect(await page.evaluate(() => localStorage.getItem('scout-lab:settings'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('scout-lab:user-state'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('other-product:data'))).toBe('keep me');
});
