import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const archive = resolve(root, 'dist/scout-lab-1.1.0.zip');

describe('Chrome Web Store package', () => {
  it('contains the complete runtime and no development files', async () => {
    execFileSync(process.execPath, ['scripts/package-extension.mjs'], { cwd: root });
    const entries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).trim().split('\n');
    const manifest = JSON.parse(execFileSync('unzip', ['-p', archive, 'manifest.json'], { encoding: 'utf8' }));
    const newTab = execFileSync('unzip', ['-p', archive, 'newtab.html'], { encoding: 'utf8' });

    expect(entries).toContain('manifest.json');
    expect(entries).toContain('newtab.html');
    expect(entries).toContain('src/app.js');
    expect(entries).toContain('assets/icons/icon-128.png');
    expect(entries.some((path) => /(^|\/)(tests?|docs?|scripts?|node_modules|coverage|store)(\/|$)/.test(path))).toBe(false);
    expect(manifest.version).toBe('1.1.0');
    expect(newTab).toContain('src/app.js?v=1.1.0');

    for (const path of entries.filter((entry) => entry.endsWith('.js'))) {
      const source = execFileSync('unzip', ['-p', archive, path], { encoding: 'utf8' });
      expect(source).not.toMatch(/\beval\s*\(|new Function\s*\(/);
    }

    expect((await readFile(archive)).length).toBeLessThan(5 * 1024 * 1024);
  });
});
