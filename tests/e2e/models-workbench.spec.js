import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route('https://www.reddit.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { children: [] } }) }));
});

const models = [
  {
    id: 'Qwen/Qwen-7B', pipeline_tag: 'text-generation',
    tags: ['transformers', 'license:apache-2.0'], downloads: 2000, likes: 200,
    trendingScore: 90, gated: false, safetensors: { total: 7_000_000_000 },
    inferenceProviderMapping: [{ provider: 'together', status: 'live' }],
    createdAt: '2026-08-20T00:00:00Z', lastModified: '2026-08-28T00:00:00Z',
  },
  {
    id: 'community/Qwen-7B-GGUF', pipeline_tag: 'text-generation',
    tags: ['gguf', 'license:apache-2.0', 'base_model:quantized:Qwen/Qwen-7B'],
    downloads: 1500, likes: 150, trendingScore: 80, gated: false,
    gguf: { total: 7_000_000_000 }, createdAt: '2026-08-21T00:00:00Z',
    lastModified: '2026-08-27T00:00:00Z', inferenceProviderMapping: [],
  },
  {
    id: 'openai/scout-vision', pipeline_tag: 'image-text-to-text',
    tags: ['transformers', 'license:mit'], downloads: 900, likes: 90,
    trendingScore: 70, gated: true, safetensors: { total: 12_000_000_000 },
    createdAt: '2026-07-01T00:00:00Z', lastModified: '2026-07-02T00:00:00Z',
    inferenceProviderMapping: [],
  },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('scout-lab:data-schema', '2');
    localStorage.setItem('scout-lab:settings', JSON.stringify({
      selectedSection: 'models',
      preferences: { startupSection: 'models', density: 'comfortable', theme: 'dark' },
    }));
  });
  await page.route('https://huggingface.co/**/raw/main/README.md', (route) => {
    const id = new URL(route.request().url()).pathname.split('/raw/main/')[0].slice(1);
    return route.fulfill({
      status: 200,
      contentType: 'text/markdown',
      body: `# ${id}\n\n${id} is documented for dependable local AI experimentation.`,
    });
  });
});

test('Models aligns sorting, filters, metadata, and family grouping with Hugging Face', async ({ page }) => {
  const requests = [];
  await page.route('https://huggingface.co/api/models**', (route) => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(models) });
  });
  await page.route('https://huggingface.co/Qwen/Qwen-7B', (route) => route.fulfill({
    status: 200, contentType: 'text/html', body: '<title>Qwen-7B</title>',
  }));
  await page.route('https://huggingface.co/community/Qwen-7B-GGUF', (route) => route.fulfill({
    status: 200, contentType: 'text/html', body: '<title>Qwen-7B-GGUF</title>',
  }));

  await page.goto('/newtab.html');

  await expect(page.getByLabel('Sort')).toHaveValue('trending');
  await expect(page.locator('.grid .card')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Qwen/Qwen-7B' })).toBeVisible();
  await expect(page.locator('[data-id="hf-model:Qwen/Qwen-7B"]'))
    .toContainText('Qwen/Qwen-7B is documented for dependable local AI experimentation.');
  await expect(page.getByText('7B', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Inference available', { exact: true }).first()).toBeVisible();

  const family = page.locator('[data-id="hf-model:Qwen/Qwen-7B"] .model-variants');
  await expect(family).toContainText('1 related variant');
  await family.locator('summary').click();
  await expect(family.getByRole('link', { name: 'community/Qwen-7B-GGUF' }))
    .toHaveAttribute('href', 'https://huggingface.co/community/Qwen-7B-GGUF');
  const variantPopupPromise = page.waitForEvent('popup');
  await family.getByRole('link', { name: 'community/Qwen-7B-GGUF' }).click();
  const variantPopup = await variantPopupPromise;
  await expect(variantPopup).toHaveURL('https://huggingface.co/community/Qwen-7B-GGUF');
  await variantPopup.close();

  const modelPopupPromise = page.waitForEvent('popup');
  await page.locator('[data-id="hf-model:Qwen/Qwen-7B"]').getByRole('link', { name: /Open/ }).click();
  const modelPopup = await modelPopupPromise;
  await expect(modelPopup).toHaveURL('https://huggingface.co/Qwen/Qwen-7B');
  await modelPopup.close();

  const sortCases = [
    ['likes', 'likes', '-1'], ['downloads', 'downloads', '-1'], ['created', 'createdAt', '-1'],
    ['updated', 'lastModified', '-1'], ['most-parameters', 'num_parameters', '-1'],
    ['least-parameters', 'num_parameters', '1'],
  ];
  for (const [value, sort, direction] of sortCases) {
    await page.getByLabel('Sort').selectOption(value);
    const request = requests.at(-1);
    expect(request.searchParams.get('sort')).toBe(sort);
    expect(request.searchParams.get('direction')).toBe(direction);
  }

  await page.getByLabel('Task').selectOption('image-text-to-text');
  expect(requests.at(-1).searchParams.get('pipeline_tag')).toBe('image-text-to-text');
  await page.getByLabel('Parameter size').selectOption('7b-30b');
  expect(requests.at(-1).searchParams.get('num_parameters')).toBe('min:7B,max:30B');
  await page.getByRole('switch', { name: 'Base models only' }).click();
  expect(requests.at(-1).searchParams.get('base_model_relation')).toBe('base');
  await page.getByRole('switch', { name: 'Inference available' }).click();
  expect(requests.at(-1).searchParams.get('inference_provider')).toBe('all');

  await page.locator('.more-filters summary').click();
  await page.getByLabel('Library or format').selectOption('transformers');
  expect(requests.at(-1).searchParams.getAll('filter')).toContain('transformers');
  await page.getByLabel('License').selectOption('apache-2.0');
  expect(requests.at(-1).searchParams.getAll('filter')).toContain('license:apache-2.0');
  await page.getByLabel('Access').selectOption('open');
  expect(requests.at(-1).searchParams.get('gated')).toBe('false');
  await page.getByLabel('Compatible app').selectOption('ollama');
  expect(requests.at(-1).searchParams.get('apps')).toBe('ollama');
  await page.getByLabel('Updated date').selectOption('week');
  await expect(page.getByRole('heading', { name: 'openai/scout-vision' })).toHaveCount(0);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('every grouped Models task sends its exact Hugging Face pipeline tag', async ({ page }) => {
  const requests = [];
  await page.route('https://huggingface.co/api/models**', (route) => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(models) });
  });

  await page.goto('/newtab.html');
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests[0].searchParams.has('pipeline_tag')).toBe(false);

  const taskValues = await page.getByLabel('Task').locator('optgroup option').evaluateAll((options) => (
    options.map(({ value }) => value)
  ));
  expect(taskValues).toHaveLength(52);

  for (const task of taskValues) {
    await page.getByLabel('Task').selectOption(task);
    expect(requests.at(-1).searchParams.get('pipeline_tag')).toBe(task);
  }

  await page.getByLabel('Task').selectOption('all');
  await expect(page.getByLabel('Task')).toHaveValue('all');
});

test('Models daily actions, saved defaults, reset, search, and mobile layout remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('https://huggingface.co/api/models**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(models),
  }));

  await page.goto('/newtab.html');
  const qwenCard = page.locator('[data-id="hf-model:Qwen/Qwen-7B"]');
  await qwenCard.getByRole('button', { name: 'Favorite' }).click();
  await expect(qwenCard.getByRole('button', { name: 'Favorite' })).toHaveClass(/active/);
  await qwenCard.getByRole('button', { name: 'Comment' }).click();
  await qwenCard.getByLabel('Comment for Qwen/Qwen-7B').fill('Try this family locally.');
  await qwenCard.getByRole('button', { name: 'Save note' }).click();
  await expect(qwenCard).toContainText('Try this family locally.');

  await page.getByLabel('Task').selectOption('text-generation');
  await page.getByRole('button', { name: 'Save as default' }).click();
  await page.getByLabel('Task').selectOption('image-text-to-text');
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.getByLabel('Task')).toHaveValue('text-generation');

  await page.getByLabel('Search this tab').fill('scout-vision');
  await expect(page.locator('.grid .card')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'openai/scout-vision' })).toBeVisible();
  await page.getByLabel('Search this tab').fill('');
  await page.locator('[data-id="hf-model:openai/scout-vision"]').getByRole('button', { name: 'Hide' }).click();
  await expect(page.getByRole('heading', { name: 'openai/scout-vision' })).toHaveCount(0);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
