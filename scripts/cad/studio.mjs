import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { z } from 'zod';
import { root, readJob, jobDir, queueJob, sha256 } from './store.mjs';

export const studioInput = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.enum(['ring', 'earrings', 'necklace', 'bracelet', 'watch', 'accessory']),
  units: z.enum(['unknown', 'mm', 'cm', 'm', 'in']).default('unknown'),
});

export async function listStudioJobs() {
  const ids = await readdir(join(root(), 'jobs')).catch(() => []);
  const jobs = await Promise.all(ids.map(id => readJob(id).catch(() => null)));
  return jobs.filter(job => job?.productId?.startsWith('studio:'))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
}

export async function getStudioJob(id) {
  const job = await readJob(id);
  if (!job.productId?.startsWith('studio:')) throw new Error('Studio asset not found');
  return job;
}

export async function queueStudioUpload(input, filename, bytes) {
  const values = studioInput.parse(input);
  const id = randomUUID();
  const source = { fileId: id, filename, kind: 'source', sha256: sha256(bytes), bytes: bytes.length };
  const product = { id: `studio:${id}`, asset_id: `ames-${values.category}-${id}`, name: values.name,
    category: values.category, workflow_status: 'submitted', source_hashes: [source.sha256] };
  return queueJob(product, source, bytes, { sourceFileId: id, units: values.units, assignments: {} });
}

export async function readStudioArtifact(job, file) {
  if (job.status !== 'ready' || !job.result) throw new Error('The asset is not ready yet');
  if (!['preview.glb', 'poster.png', 'result.json'].includes(file)) throw new Error('Unknown artifact');
  const bytes = await readFile(join(jobDir(job.id), file));
  const expected = file === 'preview.glb' ? job.result.previewSha256 : file === 'poster.png' ? job.result.posterSha256 : null;
  if (expected && sha256(bytes) !== expected) throw new Error('Asset checksum mismatch');
  return bytes;
}

export function buildStudioPack(job, glb, poster) {
  if (job.status !== 'ready' || !job.result || sha256(glb) !== job.result.previewSha256 || sha256(poster) !== job.result.posterSha256) {
    throw new Error('A ready, checksum-verified conversion is required');
  }
  const identity = { assetId: job.assetId, revisionId: `${job.assetId}:1`, publicationStatus: 'review', visualApproval: 'pending' };
  const specs = { physicalScaleConfirmed: false, unitMeaning: job.units, manufacturingReady: false };
  const limitations = [...job.result.limitations, 'Technical and visual review are required before this asset can be published.'];
  const files = {};
  const json = (name, value) => { files[name] = Buffer.from(JSON.stringify(value, null, 2) + '\n'); };
  files['web/jewelry.glb'] = glb;
  files['web/poster.png'] = poster;
  json('app/asset.json', { schemaVersion: 'ames.app-asset/1', ...identity, name: job.name, category: job.category, type: 'jewelry',
    status: { technical: 'pending', viewer: 'pending', luxury: 'pending', campaign: 'pending' },
    interactive: { glb: 'web/jewelry.glb', poster: 'web/poster.png' }, media: { hero: 'web/poster.png' }, specs, verifiedClaims: {}, limitations });
  json('app/chat.json', { schemaVersion: 'ames.chat-content/1', ...identity, type: 'jewelry', stageAsset: 'web/jewelry.glb', poster: 'web/poster.png',
    rotationEnabled: true, defaultView: 'three_quarter', supportedViewerActions: ['rotate', 'stop_rotation', 'zoom', 'reset', 'side_view'],
    essentialSpecs: specs, heroImage: 'web/poster.png', macroImage: 'web/poster.png', visualModes: ['interactive'] });
  json('app/boutique.json', { schemaVersion: 'ames.boutique-content/1', ...identity, name: job.name, category: job.category,
    thumbnail: 'web/poster.png', heroImage: 'web/poster.png', interactiveGlb: 'web/jewelry.glb', poster: 'web/poster.png', essentialSpecs: specs });
  json('app/media.json', { schemaVersion: 'ames.media-content/1', ...identity,
    items: [{ assetId: job.assetId, id: 'cad-preview', mediaType: 'image', path: 'web/poster.png', aspectRatio: 1, approvalState: 'pending' }] });
  json('master/geometry-validation.json', { triangleCount: job.result.triangleCount, components: job.result.components, manufacturingReady: false });
  json('master/gemstone-material-metadata.json', { components: job.result.components, materialIdentityVerified: false });
  json('master/source.json', { filename: job.sourceFilename, sha256: job.sourceSha256, declaredUnits: job.units, conversionId: job.id });
  json('quality-report.json', { assetId: job.assetId, requiredFilesPresent: true, sourceHashVerified: true,
    preparedMasterHashVerified: false, browserValidationPassed: false, commercialVisualApproval: 'pending', limitations });
  json('manifest.json', { assetId: job.assetId, revision: 1, name: job.name, category: job.category, sourceSha256: job.sourceSha256,
    files: Object.keys(files).filter(name => name !== 'quality-report.json') });
  json('sha256.json', { files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, sha256(bytes)])) });
  files['README.txt'] = Buffer.from('Private CAD review pack. Original source remains on the workstation.\nGLB and transparent PNG are accompanied by AMES Chat, Boutique and Media contracts.\nNot published or commercially approved. Technical checks, browser validation and visual approval are still required.\nExtract into a folder named after the assetId. Keep this ZIP as delivery.zip alongside the extracted manifest for the existing review workflow.\n');
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, bytes]) => [`${job.assetId}/${name}`, bytes])), { level: 1 });
}

/** Make a fresh revision from the retained source; never overwrite an approved pack. */
export async function rerenderStudioJob(id) {
  const job = await getStudioJob(id);
  if (job.status === 'queued' || job.status === 'processing') throw new Error('This design is already rendering');
  const bytes = await readFile(join(jobDir(id), 'source.' + job.extension));
  if (sha256(bytes) !== job.sourceSha256) throw new Error('Source checksum mismatch');
  return queueStudioUpload({ name: job.name, category: job.category, units: job.units }, job.sourceFilename, bytes);
}
