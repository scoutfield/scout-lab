import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route('https://www.reddit.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { children: [] } }) }));
});

const trendingHtml = await readFile(resolve(process.cwd(), 'tests', 'fixtures', 'github-trending.html'), 'utf8');
const arxivXml = await readFile(resolve(process.cwd(), 'tests', 'fixtures', 'arxiv.xml'), 'utf8');

const contrastRatio = (foreground, background) => {
  const luminance = (color) => {
    const channels = color.match(/\d+/g).slice(0, 3).map((value) => Number(value) / 255)
      .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const values = [luminance(foreground), luminance(background)];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
};

const columnCount = (page) => page.locator('.grid').evaluate((grid) => (
  getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length
));

const cardTypography = (page) => page.locator('.card').first().evaluate((card) => {
  const style = (selector) => getComputedStyle(card.querySelector(selector));
  const title = style('h3');
  const summary = style('.summary');
  return {
    title: Number.parseFloat(title.fontSize),
    summary: Number.parseFloat(summary.fontSize),
    summaryLineHeight: Number.parseFloat(summary.lineHeight) / Number.parseFloat(summary.fontSize),
    summaryClamp: summary.webkitLineClamp,
    badge: Number.parseFloat(style('.badge').fontSize),
    metric: Number.parseFloat(style('.metric').fontSize),
    tag: Number.parseFloat(style('.tag').fontSize),
    secondary: Number.parseFloat(style('.secondary').fontSize),
    action: Number.parseFloat(style('.open').fontSize),
  };
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('scout-lab:reading-comfort-seeded')) return;
    localStorage.clear();
    localStorage.setItem('scout-lab:data-schema', '2');
    localStorage.setItem('scout-lab:settings', JSON.stringify({
      selectedSection: 'code',
      preferences: {
        startupSection: 'code',
        density: 'comfortable',
        theme: 'light',
        textSize: 'standard',
      },
    }));
    sessionStorage.setItem('scout-lab:reading-comfort-seeded', 'true');
  });
  await page.route('**/__scout/github-trending**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: trendingHtml,
  }));
});

test('Large text applies across both rails, persists, and can return to Standard', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/newtab.html');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('group', { name: 'Text size' }).getByRole('button', { name: 'Large' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
  const large = await page.evaluate(() => {
    const size = (selector) => Number.parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
    return {
      rail: Number.parseFloat(getComputedStyle(document.querySelector('.shell')).gridTemplateColumns),
      brand: size('.brand h1'),
      nav: size('.nav button'),
      heading: size('.header h2'),
      subtitle: size('.header p'),
      status: size('.feed-status'),
      note: size('[data-daily-note]'),
      settingsLabel: size('.settings-label'),
      settingsButton: size('.settings-segment button'),
      drawer: document.querySelector('.settings-drawer').getBoundingClientRect().width,
    };
  });
  expect(large).toMatchObject({ rail: 248, brand: 21, heading: 26, subtitle: 14, status: 13, note: 16 });
  expect(large.nav).toBeGreaterThanOrEqual(17);
  expect(large.settingsLabel).toBeGreaterThanOrEqual(12);
  expect(large.settingsButton).toBeGreaterThanOrEqual(12);
  expect(large.drawer).toBeGreaterThanOrEqual(440);
  expect(await cardTypography(page)).toMatchObject({
    title: 20, summary: 16, badge: 13, metric: 13, tag: 13, secondary: 13, action: 14,
  });

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
  await expect(page.locator('.grid .card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('group', { name: 'Text size' }).getByRole('button', { name: 'Large' }))
    .toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('group', { name: 'Text size' }).getByRole('button', { name: 'Standard' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'standard');
  expect(await cardTypography(page)).toMatchObject({ title: 18, summary: 15 });
  expect(await page.locator('.shell').evaluate((shell) => Number.parseFloat(getComputedStyle(shell).gridTemplateColumns)))
    .toBe(228);
});

test('text size and density combinations avoid overflow across supported viewports', async ({ page }) => {
  await page.goto('/newtab.html');
  const viewports = [
    { width: 1440, height: 900 },
    { width: 900, height: 900 },
    { width: 390, height: 844 },
  ];

  for (const textSize of ['standard', 'large']) {
    for (const density of ['comfortable', 'compact']) {
      await page.evaluate(({ nextTextSize, nextDensity }) => {
        const settings = JSON.parse(localStorage.getItem('scout-lab:settings'));
        localStorage.setItem('scout-lab:settings', JSON.stringify({
          ...settings,
          preferences: { ...settings.preferences, textSize: nextTextSize, density: nextDensity },
        }));
      }, { nextTextSize: textSize, nextDensity: density });
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.reload();
        await page.locator('.grid .card').first().waitFor({ state: 'visible' });
        await expect(page.locator('html')).toHaveAttribute('data-text-size', textSize);
        await expect(page.locator('html')).toHaveAttribute('data-density', density);
        const layout = await page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          shellClientWidth: document.querySelector('.shell').clientWidth,
          shellScrollWidth: document.querySelector('.shell').scrollWidth,
          overflowing: [...document.querySelectorAll('body *')]
            .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
            .slice(0, 5)
            .map((element) => `${element.tagName.toLowerCase()}.${element.className}`),
        }));
        const mode = `${textSize}/${density}/${viewport.width}x${viewport.height}`;
        expect(layout.documentWidth, `${mode}: ${layout.overflowing.join(', ')}`)
          .toBeLessThanOrEqual(layout.viewportWidth);
        expect(layout.shellScrollWidth, mode).toBeLessThanOrEqual(layout.shellClientWidth);
      }
    }
  }
});

test('Comfortable density is a three-column long-reading surface', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/newtab.html');

  await expect(page.locator('.grid .card')).toHaveCount(2);
  await expect.poll(() => columnCount(page)).toBe(3);

  const typography = await cardTypography(page);
  expect(typography).toMatchObject({
    title: 18,
    summary: 15,
    summaryClamp: '4',
    badge: 12,
    metric: 12,
    tag: 12,
    secondary: 12,
    action: 13,
  });
  expect(typography.summaryLineHeight).toBeGreaterThanOrEqual(1.55);

  await page.locator('.card').first().getByRole('button', { name: 'Comment' }).click();
  expect(await page.getByRole('button', { name: 'Save note' }).evaluate((button) => (
    Number.parseFloat(getComputedStyle(button).fontSize)
  ))).toBe(13);
});

test('Compact density remains the denser four-column option', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/newtab.html');
  await page.locator('.grid .card').first().waitFor({ state: 'visible' });

  const comfortableTitleSize = (await cardTypography(page)).title;
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('group', { name: 'Density' }).getByRole('button', { name: 'Compact' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await expect.poll(() => columnCount(page)).toBe(4);
  expect((await cardTypography(page)).title).toBeLessThan(comfortableTitleSize);
});

test('Comfortable grid reduces to two and one columns without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto('/newtab.html');
  await page.locator('.grid .card').first().waitFor({ state: 'visible' });

  await expect.poll(() => columnCount(page)).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => columnCount(page)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('light and dark reading surfaces avoid pure white and pure black fields', async ({ page }) => {
  await page.goto('/newtab.html');
  await page.locator('.grid .card').first().waitFor({ state: 'visible' });

  const light = await page.evaluate(() => ({
    page: getComputedStyle(document.body).backgroundColor,
    card: getComputedStyle(document.querySelector('.card')).backgroundColor,
    summary: getComputedStyle(document.querySelector('.summary')).color,
    muted: getComputedStyle(document.querySelector('.metric')).color,
  }));
  expect(light.page).not.toBe('rgb(255, 255, 255)');
  expect(light.card).not.toBe('rgb(255, 255, 255)');
  expect(contrastRatio(light.summary, light.card)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(light.muted, light.card)).toBeGreaterThanOrEqual(4.5);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Dark' }).click();
  const dark = await page.evaluate(() => ({
    page: getComputedStyle(document.body).backgroundColor,
    card: getComputedStyle(document.querySelector('.card')).backgroundColor,
    summary: getComputedStyle(document.querySelector('.summary')).color,
    muted: getComputedStyle(document.querySelector('.metric')).color,
  }));
  expect(dark.page).not.toBe('rgb(0, 0, 0)');
  expect(dark.card).not.toBe('rgb(0, 0, 0)');
  expect(contrastRatio(dark.summary, dark.card)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(dark.muted, dark.card)).toBeGreaterThanOrEqual(4.5);
});

test('all workbenches retain shared reading type and source-specific controls', async ({ page }) => {
  await page.route('https://huggingface.co/api/models**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{
      id: 'scout/model', pipeline_tag: 'text-generation', tags: ['license:apache-2.0'],
      downloads: 1200, likes: 42, trendingScore: 17, gated: false, createdAt: '2026-08-28T00:00:00Z',
    }]),
  }));
  await page.route('https://huggingface.co/api/datasets**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{
      id: 'scout/dataset', description: 'A carefully documented evaluation dataset.',
      tags: ['task_categories:text-classification', 'size_categories:1K<n<10K', 'language:en', 'license:apache-2.0'],
      downloads: 900, likes: 31, trendingScore: 12, lastModified: '2026-08-28T00:00:00Z',
    }]),
  }));
  await page.route('https://huggingface.co/api/daily_papers**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{
      paper: {
        id: '2608.00001', title: 'Readable Research Interfaces',
        ai_summary: 'A study of interfaces designed for sustained technical reading.',
        authors: [{ name: 'Scout Research' }], upvotes: 88,
        publishedAt: '2026-08-28T00:00:00Z', ai_keywords: ['interfaces', 'reading'],
      },
      numComments: 4,
    }]),
  }));
  await page.route('https://export.arxiv.org/api/query**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/atom+xml',
    body: arxivXml,
  }));
  await page.route('**/__scout/arxiv**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/atom+xml',
    body: arxivXml,
  }));

  await page.goto('/newtab.html');

  for (const section of ['Today', 'Models', 'Datasets', 'Papers']) {
    await page.getByRole('button', { name: new RegExp(`^${section}`) }).click();
    await page.locator('.grid .card:not(.skeleton-card)').first().waitFor({ state: 'visible' });
    const type = await cardTypography(page);
    expect(type.title).toBe(18);
    expect(type.summary).toBe(15);
    await expect.poll(() => columnCount(page)).toBe(3);
  }

  await page.getByRole('button', { name: /^Papers/ }).click();
  await page.getByRole('group', { name: 'Source' }).getByRole('button', { name: 'Raw arXiv' }).click();
  await expect(page.locator('.feed-status')).toContainText('Raw arXiv');
  await expect(page.locator('.grid .card')).toHaveCount(1);

});

test('Today is a fixed briefing without topic or filter chrome', async ({ page }) => {
  await page.goto('/newtab.html');
  await page.getByRole('button', { name: /Today/ }).click();

  await expect(page.getByRole('heading', { name: "Today's queue" })).toBeVisible();
  await expect(page.getByLabel('Topic')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Today filters' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reset filters' })).toHaveCount(0);
  await expect(page.getByLabel('Search this tab')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
});
