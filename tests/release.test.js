import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const readText = async (path) => readFile(resolve(root, path), 'utf8');

const pngSize = async (path) => {
  const png = await readFile(resolve(root, path));
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
};

describe('Chrome Web Store 1.1.0 release contract', () => {
  it('declares the release version and packaged icons', async () => {
    const manifest = await readJson('manifest.json');
    const pkg = await readJson('package.json');

    expect(manifest.version).toBe('1.1.0');
    expect(pkg.version).toBe('1.1.0');
    expect(manifest.icons).toEqual({
      16: 'assets/icons/icon-16.png',
      32: 'assets/icons/icon-32.png',
      48: 'assets/icons/icon-48.png',
      128: 'assets/icons/icon-128.png',
    });

    for (const size of [16, 32, 48, 128]) {
      await expect(pngSize(`assets/icons/icon-${size}.png`)).resolves.toEqual({ width: size, height: size });
    }
  });

  it('uses the approved Beacon Circle vector master', async () => {
    const icon = await readText('store/assets/scout-lab-icon-master.svg');

    expect(icon).toContain('id="beacon-circle"');
    expect(icon).toContain('#17232d');
    expect(icon).toContain('#16c784');
    expect(icon).toContain('#ffb51b');
    expect(icon).toContain('stroke-linecap="round"');
    expect(icon).not.toMatch(/#1697f6|gradient|shadow|compass/i);
  });

  it('ships exact-dimension store graphics', async () => {
    for (const name of ['today-dark', 'code-trending', 'models-discovery']) {
      await expect(pngSize(`store/assets/screenshot-${name}.png`)).resolves.toEqual({ width: 1280, height: 800 });
    }
    await expect(pngSize('store/assets/promo-small.png')).resolves.toEqual({ width: 440, height: 280 });
  });

  it('keeps listing, privacy, and manifest claims consistent', async () => {
    const listing = await readJson('store/listing.json');
    const manifest = await readJson('manifest.json');
    const privacy = await readText('PRIVACY.md');

    expect(listing.name).toBe(manifest.name);
    expect(listing.summary.length).toBeLessThanOrEqual(132);
    expect(listing.category).toBe('Developer Tools');
    expect(listing.singlePurpose).toContain('new-tab');
    expect(listing.remoteCode).toBe(false);
    expect(listing.collectsUserData).toBe(false);
    expect(listing.permissionJustifications).toEqual(Object.fromEntries(
      manifest.host_permissions.map((permission) => [permission, expect.any(String)]),
    ));
    expect(privacy).toContain('does not collect');
    expect(privacy).toContain('stored locally');
    expect(privacy).toContain('Chrome Web Store User Data Policy');
  });

  it('defines a deterministic production package command', async () => {
    const pkg = await readJson('package.json');
    const readme = await readText('README.md');

    expect(pkg.scripts.package).toBe('node scripts/package-extension.mjs');
    await expect(readText('scripts/package-extension.mjs')).resolves.toContain('scout-lab-1.1.0.zip');
    expect(readme).not.toMatch(/curated learning|learning progress|progress filters/i);
  });
});
