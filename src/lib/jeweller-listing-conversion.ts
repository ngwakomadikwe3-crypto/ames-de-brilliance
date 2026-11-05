import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { changeListing, type JewellerListing } from './jeweller-listing';
import { mutateListing } from './jeweller-listing-store';
import { fileBytes, saveCompleteFile } from './jeweller-listing-files';
import { queueJob, workerHealth, readJob, jobDir } from '../../scripts/cad/store.mjs';

export async function queueListingConversion(listing: JewellerListing, body: Record<string, unknown>, actor: string) {
  const input = z.object({ sourceId: z.uuid(), units: z.enum(['unknown', 'mm', 'cm', 'm', 'in']) }).parse(body);
  const file = listing.files.find(f => f.id === input.sourceId && f.complete && f.kind === 'source');
  if (!file || !/\.(glb|obj|stl|fbx)$/i.test(file.name)) throw new Error('Select a complete GLB, OBJ, STL or FBX export. A 3DM original needs a companion mesh export.');
  if (['queued', 'processing'].includes(listing.conversion?.status || '') && !(actor === 'owner' && !listing.conversion?.jobId)) throw new Error('A conversion is already pending');
  if (listing.files.filter(f => !['preview','poster'].includes(f.kind)).length > 10) throw new Error('Keep at most ten source/evidence files to leave room for conversion outputs');
  let jobId: string | undefined;
  // Native import on the workstation is an explicit staff operation. Untrusted
  // cloud imports are queued for the isolated worker, never run in a Function.
  if (!process.env.VERCEL && actor === 'owner') {
    if (!(await workerHealth()).online) throw new Error('Start the workstation CAD worker before converting');
    const bytes = await fileBytes(file);
    const job = await queueJob({ id: listing.id, asset_id: `listing-${listing.id}`, name: listing.details.name, category: listing.details.category,
      workflow_status: 'submitted', source_hashes: [file.sha256] }, { fileId: file.id, filename: file.name, sha256: file.sha256, bytes: file.bytes, kind: 'source' }, bytes,
    { sourceFileId: file.id, units: input.units, assignments: {} });
    jobId = job.id;
  }
  return changeListing(listing, { conversion: { status: 'queued', sourceId: file.id, units: input.units, ...(jobId ? { jobId } : {}) },
    files: listing.files.filter(f => !['preview', 'poster'].includes(f.kind)), review: null }, 'conversion_requested', actor);
}
export async function refreshLocalConversion(listing: JewellerListing) {
  if (process.env.VERCEL || !listing.conversion?.jobId || !['queued', 'processing'].includes(listing.conversion.status)) return listing;
  const job = await readJob(listing.conversion.jobId).catch(() => null);
  if (!job || !['ready', 'failed', 'processing'].includes(job.status) || (job.status === 'processing' && listing.conversion.status === 'processing')) return listing;
  return mutateListing(listing.id, async current => {
    const conversion = current.conversion;
    if (!conversion || conversion.jobId !== job.id || !['queued', 'processing'].includes(conversion.status)) return current;
    if (job.status === 'processing') return changeListing(current, { conversion: { ...conversion, status: 'processing' } }, 'conversion_processing', 'worker');
    if (job.status === 'failed') return changeListing(current, { conversion: { ...conversion, status: 'failed', error: 'Conversion failed. Check the source or supply a new export.' } }, 'conversion_failed', 'worker');
    const source = current.files.find(f => f.id === conversion.sourceId);
    if (!source || source.sha256 !== job.sourceSha256) throw new Error('Conversion source does not match this listing');
    const glb = await readFile(join(jobDir(job.id), 'preview.glb')), poster = await readFile(join(jobDir(job.id), 'poster.png'));
    const { digest } = await import('./jeweller-listing-store');
    if (digest(glb) !== job.result.previewSha256 || digest(poster) !== job.result.posterSha256) throw new Error('Conversion artifact checksum failed');
    const files = [await saveCompleteFile('preview', 'preview.glb', glb), await saveCompleteFile('poster', 'poster.png', poster)];
    return changeListing(current, { files: [...current.files, ...files], conversion: { ...conversion, status: 'ready' } }, 'conversion_ready', 'worker');
  });
}
