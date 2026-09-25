import { copyFile, mkdir, realpath, stat, writeFile } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enginePackSources, readPackContracts } from './ames-engine-packs.mjs';

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sources = await enginePackSources(appRoot);
const publicRoot = join(appRoot, 'public', 'ames-engine');
const contracts = [];

for (const sourceRoot of sources) {
  const { boutique } = await readPackContracts(sourceRoot);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(boutique.assetId)) throw new Error('Unsafe asset ID');
  if (contracts.includes(`${boutique.assetId}/app/boutique.json`)) throw new Error('Duplicate Boutique asset ID');
  const paths = ['app/boutique.json', boutique.thumbnail, boutique.heroImage, boutique.interactiveGlb, boutique.poster];
  const targetRoot = resolve(publicRoot, boutique.assetId);
  for (const path of new Set(paths)) {
    if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) throw new Error(`Unsafe Boutique path: ${path}`);
    const source = await realpath(resolve(sourceRoot, path));
    if (!source.startsWith(sourceRoot + sep) || !(await stat(source)).isFile()) throw new Error(`Missing Boutique source: ${path}`);
    const target = resolve(targetRoot, path);
    if (!target.startsWith(targetRoot + sep)) throw new Error(`Unsafe Boutique target: ${path}`);
    await mkdir(resolve(target, '..'), { recursive: true });
    await copyFile(source, target);
  }
  contracts.push(`${boutique.assetId}/app/boutique.json`);
}

await mkdir(join(publicRoot, 'boutique'), { recursive: true });
await writeFile(join(publicRoot, 'boutique', 'index.json'), JSON.stringify({ schemaVersion: 'ames.boutique-index/1', contracts }, null, 2) + '\n');
console.log(`Synced ${contracts.length} AMES Boutique contract(s)`);
