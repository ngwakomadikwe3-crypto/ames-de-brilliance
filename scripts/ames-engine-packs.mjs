import { access, readFile, readdir } from 'node:fs/promises';
import { delimiter, join, resolve, basename } from 'node:path';

export async function enginePackSources(appRoot) {
  const configured = process.env.AMES_ENGINE_PACK_DIRS || process.env.AMES_ENGINE_PACK_DIR;
  if (configured) return configured.split(delimiter).map(value => resolve(value.trim())).filter(Boolean);

  const distRoot = resolve(appRoot, '..', 'ames-engine-main', 'dist');
  const entries = await readdir(distRoot, { withFileTypes: true });
  const packs = (await Promise.all(entries.filter(entry => entry.isDirectory()).map(async entry => {
    const path = join(distRoot, entry.name);
    try { await access(join(path, 'manifest.json')); return path; }
    catch { return null; }
  }))).filter(Boolean);
  if (!packs.length) throw new Error(`No AMES Engine packs found in ${distRoot}`);

  // Preserve the established feed order when adding newly discovered packs.
  let priorIds = [];
  try {
    const index = JSON.parse(await readFile(join(appRoot, 'public', 'ames-engine', 'chat', 'index.json'), 'utf8'));
    priorIds = index.contracts.map(path => path.split('/')[0]);
  } catch { /* First sync: use stable alphabetical order. */ }
  const order = new Map(priorIds.map((id, index) => [id, index]));
  return packs.sort((a, b) => (order.get(basename(a)) ?? Infinity) - (order.get(basename(b)) ?? Infinity) || basename(a).localeCompare(basename(b)));
}

export async function readPackContracts(sourceRoot) {
  const read = async path => JSON.parse(await readFile(join(sourceRoot, path), 'utf8'));
  const [manifest, asset, chat, boutique, media] = await Promise.all([
    read('manifest.json'), read('app/asset.json'), read('app/chat.json'), read('app/boutique.json'), read('app/media.json'),
  ]);
  const id = manifest.assetId;
  const revision = `${id}:${manifest.revision}`;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id) ||
      asset.schemaVersion !== 'ames.app-asset/1' || chat.schemaVersion !== 'ames.chat-content/1' ||
      boutique.schemaVersion !== 'ames.boutique-content/1' || media.schemaVersion !== 'ames.media-content/1' ||
      [asset, chat, boutique, media].some(contract => contract.assetId !== id || contract.revisionId !== revision ||
        contract.publicationStatus !== asset.publicationStatus || contract.visualApproval !== asset.visualApproval) ||
      asset.category !== boutique.category ||
      (asset.publicationStatus === 'published' && asset.visualApproval !== 'approved')) {
    throw new Error(`AMES pack identity, category, revision, or approval mismatch: ${sourceRoot}`);
  }
  return { manifest, asset, chat, boutique, media };
}
