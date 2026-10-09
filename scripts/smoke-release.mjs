import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import { parseGithubTrending } from '../src/services/normalizers.js';

const root = process.cwd();
const archive = resolve(root, 'dist/scout-lab-1.1.0.zip');
const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'scout-lab-release-'));
const extensionPath = resolve(temporaryRoot, 'extension');
const profilePath = resolve(temporaryRoot, 'profile');

await mkdir(extensionPath, { recursive: true });
execFileSync('unzip', ['-q', archive, '-d', extensionPath]);

const sourceUrl = 'https://github.com/trending?since=daily';
const sourceResponse = await fetch(sourceUrl, { signal: AbortSignal.timeout(15_000) });
if (!sourceResponse.ok) throw new Error(`GitHub Trending returned ${sourceResponse.status}`);
const sourceHtml = await sourceResponse.text();
globalThis.DOMParser = new JSDOM('').window.DOMParser;
const sourceCards = parseGithubTrending(sourceHtml, 'day');
if (!sourceCards.length) throw new Error('GitHub Trending returned no parseable repositories.');

let context;
try {
  context = await chromium.launchPersistentContext(profilePath, {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  const page = context.pages()[0] || await context.newPage();
  await page.route(sourceUrl, (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: sourceHtml,
  }));
  await page.goto('chrome://newtab/');
  await page.getByRole('heading', { name: 'Scout Lab' }).waitFor({ state: 'visible' });
  const url = page.url();
  if (!url.startsWith('chrome-extension://') || !url.endsWith('/newtab.html')) {
    throw new Error(`Packaged new-tab override did not load: ${url}`);
  }
  const icon = page.locator('img.mark');
  await icon.waitFor({ state: 'visible' });
  if (!(await icon.getAttribute('src'))?.includes('assets/icons/icon-48.png')) {
    throw new Error('Packaged release icon did not load.');
  }
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  const expectedTitles = sourceCards.slice(0, 24).map((card) => card.title);
  const expectedPeriodStars = sourceCards.slice(0, 24).map((card) => card.metricValue);
  await page.waitForFunction(
    (expectedCount) => document.querySelectorAll('.grid .card h3').length === expectedCount,
    expectedTitles.length,
    { timeout: 20_000 },
  );
  const renderedTitles = await page.locator('.grid .card h3').allTextContents();
  const renderedPeriodStars = await page.locator('.grid .card .metric').allTextContents();
  if (JSON.stringify(renderedTitles) !== JSON.stringify(expectedTitles)) {
    throw new Error('Packaged Code repository order differs from GitHub Trending.');
  }
  if (JSON.stringify(renderedPeriodStars) !== JSON.stringify(expectedPeriodStars)) {
    throw new Error('Packaged Code period stars differ from GitHub Trending.');
  }
  console.log(`Packaged extension live parity passed: ${renderedTitles.length} GitHub repositories at ${url}`);
} finally {
  await context?.close();
  await rm(temporaryRoot, { recursive: true, force: true });
}
