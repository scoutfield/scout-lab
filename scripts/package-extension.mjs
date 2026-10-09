import { mkdir, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const outputDirectory = resolve(root, 'dist');
const outputName = 'scout-lab-1.1.0.zip';
const outputPath = resolve(outputDirectory, outputName);

const walk = async (directory) => {
  const entries = await readdir(resolve(root, directory), { withFileTypes: true });
  const paths = await Promise.all(entries.map(async (entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return paths.flat();
};

const runtimeFiles = [
  'manifest.json',
  'newtab.html',
  ...(await walk('assets/icons')),
  ...(await walk('src')),
].sort();

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const result = spawnSync('zip', ['-X', '-q', outputPath, ...runtimeFiles], {
  cwd: root,
  encoding: 'utf8',
});

if (result.status !== 0) {
  throw new Error(result.stderr || 'Could not create the Chrome Web Store ZIP.');
}

console.log(`${outputName}: ${runtimeFiles.length} production files`);
