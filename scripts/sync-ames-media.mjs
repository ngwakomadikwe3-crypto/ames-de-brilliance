import { copyFile, mkdir, realpath, stat, writeFile } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enginePackSources, readPackContracts } from './ames-engine-packs.mjs';

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sources = await enginePackSources(appRoot);
const publicRoot = join(appRoot, 'public', 'ames-engine');
const contracts = [];

for (const sourceRoot of sources) {
  const { media, asset } = await readPackContracts(sourceRoot);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(media.assetId)) throw new Error('Unsafe asset ID');
  if (contracts.includes(`${media.assetId}/app/media.json`)) throw new Error('Duplicate Media asset ID');
  const paths = ['app/media.json', 'app/asset.json', 'app/boutique.json', asset.interactive.poster, ...media.items.map(item => {
    if (item.assetId !== media.assetId) throw new Error('Media item asset ID mismatch');
    return item.path;
  })];
  const targetRoot = resolve(publicRoot, media.assetId);
  for (const path of new Set(paths)) {
    if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) throw new Error(`Unsafe Media path: ${path}`);
    const source = await realpath(resolve(sourceRoot, path));
    if (!source.startsWith(sourceRoot + sep) || !(await stat(source)).isFile()) throw new Error(`Missing Media source: ${path}`);
    const target = resolve(targetRoot, path);
    if (!target.startsWith(targetRoot + sep)) throw new Error(`Unsafe Media target: ${path}`);
    await mkdir(resolve(target, '..'), { recursive: true });
    await copyFile(source, target);
  }
  contracts.push(`${media.assetId}/app/media.json`);
}

await mkdir(join(publicRoot, 'media'), { recursive: true });
await writeFile(join(publicRoot, 'media', 'index.json'), JSON.stringify({ schemaVersion: 'ames.media-index/1', contracts }, null, 2) + '\n');
console.log(`Synced ${contracts.length} AMES Media contract(s)`);
