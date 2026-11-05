/** Explicit staff handoff: download one approved-for-conversion source, use the
 * existing workstation worker, then send only derivative artifacts back.
 * No inbound port/tunnel; this process cannot approve or publish a listing.
 * node --env-file=.env.cad-worker.local scripts/cad/listing-operator.mjs --listing UUID
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { queueJob, workerHealth, readJob, jobDir, sha256 } from './store.mjs';
const id = process.argv[process.argv.indexOf('--listing') + 1];
if (!process.argv.includes('--listing') || !/^[a-f0-9-]{36}$/.test(id || '')) throw new Error('Specify one staff-reviewed listing with --listing UUID');
const site = new URL(process.env.AMES_LISTING_SITE || 'https://houseofames.com');
if (site.protocol !== 'https:' && !(site.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(site.hostname))) throw new Error('Use an HTTPS AMES site');
if (site.username || site.password || site.search || site.hash || site.pathname !== '/') throw new Error('Use the AMES site origin only');
const secret = process.env.AMES_LISTING_WORKER_TOKEN;
if (!secret || secret.length < 48) throw new Error('Configure AMES_LISTING_WORKER_TOKEN');
if (!(await workerHealth()).online) throw new Error('Start npm run cad:worker on the workstation first');
const headers = { Authorization: `Bearer ${secret}` };
async function api(body) {
  const response = await fetch(new URL('/api/jeweller-worker', site), { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Worker handoff failed (${response.status})`);
  return response.json();
}
const claim = await api({ action: 'claim', id });
const lease = claim.conversion.lease, source = claim.source;
try {
  if (!/^[a-f0-9-]{36}$/.test(source.id) || source.bytes > 100 * 1024 * 1024) throw new Error('Invalid handoff source');
  const response = await fetch(new URL(`/api/jeweller-worker/${id}/files/${source.id}`, site), { headers: { ...headers, 'X-CAD-Lease': lease }, redirect: 'error', signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error('Source download failed');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== source.bytes || sha256(bytes) !== source.sha256) throw new Error('Source checksum failed');
  const job = await queueJob({ id, asset_id: `listing-${id}`, name: claim.name, category: claim.category, workflow_status: 'submitted', source_hashes: [source.sha256] },
    { fileId: source.id, filename: source.name, bytes: source.bytes, sha256: source.sha256, kind: 'source' }, bytes,
    { sourceFileId: source.id, units: claim.conversion.units, assignments: {} });
  console.log(`Converting listing ${id}; job ${job.id}`);
  let result;
  const until = Date.now() + 12 * 60000;
  while (Date.now() < until) {
    const current = await readJob(job.id);
    if (current.status === 'failed') throw new Error('The workstation conversion failed');
    if (current.status === 'ready') { result = current.result; break; }
    await new Promise(r => setTimeout(r, 2000));
  }
  if (!result) throw new Error('Conversion timed out');
  for (const [kind, name, expected] of [['preview', 'preview.glb', result.previewSha256], ['poster', 'poster.png', result.posterSha256]]) {
    const artifact = await readFile(join(jobDir(job.id), name));
    if (sha256(artifact) !== expected) throw new Error('Local artifact checksum failed');
    const { file } = await api({ action: 'start_file', id, lease, file: { kind, name, bytes: artifact.length, sha256: expected } });
    const size = 3 * 1024 * 1024;
    for (let index = 0; index * size < artifact.length; index++) {
      const r = await fetch(new URL(`/api/jeweller-worker/${id}/files/${file.id}?part=${index}`, site), { method: 'PUT', headers: { ...headers, 'X-CAD-Lease': lease, 'Content-Type': 'application/octet-stream' }, body: artifact.subarray(index * size, (index + 1) * size), redirect: 'error', signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error(`Artifact upload failed (${r.status})`);
    }
  }
  await api({ action: 'finish', id, lease, sourceSha256: source.sha256, previewSha256: result.previewSha256, posterSha256: result.posterSha256 });
  console.log('Private 3D preview ready. Staff technical, visual, pricing and origin review are still required.');
} catch (e) {
  await api({ action: 'fail', id, lease }).catch(() => {}); throw e;
}
