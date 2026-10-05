import { access, readFile } from 'node:fs/promises';

const requiredFiles = [
  'manifest.json',
  'assets/icons/icon-16.png',
  'assets/icons/icon-32.png',
  'assets/icons/icon-48.png',
  'assets/icons/icon-128.png',
  'newtab.html',
  'playwright.config.js',
  'scripts/dev-server.mjs',
  'src/app.js',
  'src/settings.js',
  'src/theme-init.js',
  'src/workbenches.js',
  'src/services/feeds.js',
  'src/services/linkOpening.js',
  'src/services/backup.js',
  'src/services/query.js',
  'src/services/normalizers.js',
  'src/services/descriptions.js',
  'src/services/storage.js',
  'src/services/startup.js',
  'src/services/archive.js',
  'src/services/archiveFormat.js',
  'src/services/dataReset.js',
  'src/ui/render.js',
  'src/ui/settings.js',
  'src/styles/app.css',
  'src/styles/settings.css',
  'src/styles/responsive.css',
  'docs/product-design.md',
  'docs/testing.md',
  'docs/ui-design.md',
  'tests/acceptance/browser-matrix.md',
  'tests/e2e/code-results.spec.js',
  'tests/e2e/startup-cache.spec.js',
  'tests/startup.test.js',
];

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

for (const file of requiredFiles) {
  try {
    await access(file);
  } catch {
    fail(`Missing required file: ${file}`);
  }
}

const manifest = await readJson('manifest.json');

if (manifest.manifest_version !== 3) {
  fail('manifest.json must use Manifest V3');
}

if (manifest.name !== 'Scout Lab') {
  fail('manifest.json name must be Scout Lab');
}

if (manifest.version !== '1.0.5') {
  fail('manifest.json must use the public release version 1.0.5');
}

for (const size of ['16', '32', '48', '128']) {
  if (manifest.icons?.[size] !== `assets/icons/icon-${size}.png`) fail(`Missing ${size}px release icon`);
}

if (manifest.chrome_url_overrides?.newtab !== 'newtab.html') {
  fail('manifest.json must override the new tab with newtab.html');
}

for (const permission of ['https://github.com/*', 'https://huggingface.co/*', 'https://export.arxiv.org/*', 'https://hn.algolia.com/*']) {
  if (!manifest.host_permissions?.includes(permission)) fail(`Missing host permission: ${permission}`);
}

for (const origin of ['https://github.com', 'https://huggingface.co', 'https://export.arxiv.org', 'https://hn.algolia.com']) {
  if (!manifest.content_security_policy?.extension_pages?.includes(origin)) fail(`Missing connect-src origin: ${origin}`);
}

if (manifest.host_permissions?.includes('https://api.github.com/*')) {
  fail('GitHub API permission must not be present when Code uses only GitHub Trending');
}

const html = await readFile('newtab.html', 'utf8');

if (!html.includes('src/styles/app.css') || !html.includes('src/app.js')) {
  fail('newtab.html must load the app CSS and JavaScript entrypoint');
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('Scout Lab extension check passed.');
