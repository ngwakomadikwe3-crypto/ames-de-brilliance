import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { queueJob, readJob, sha256 } from './cad/store.mjs';

// Trusted repository fixture only. This does not validate the Linux sandbox or cloud upload.
const sourcePath = 'public/ames-engine/dev-test-candidate-ring/web/jewelry.glb';
const bytes = await readFile(sourcePath);
await mkdir('.ames-cad/tests', { recursive: true });
process.env.AMES_CAD_ROOT = await mkdtemp(resolve('.ames-cad/tests/ring-'));
process.env.AMES_CAD_RENDER_SIZE = '256';
const source = { fileId: 'ring-fixture', kind: 'source', filename: 'ring.glb', bytes: bytes.length, sha256: sha256(bytes) };
const product = { id: 'ring-fixture', asset_id: 'ring-fixture', name: 'Private ring test', category: 'ring', workflow_status: 'submitted', source_hashes: [source.sha256] };
const queued = await queueJob(product, source, bytes, { sourceFileId: source.fileId, units: 'unknown', assignments: {} });
await new Promise((resolveRun, reject) => {
  const child = spawn(process.execPath, ['scripts/cad/worker.mjs', '--once'], { windowsHide: true, stdio: 'inherit' });
  child.on('error', reject);
  child.on('close', code => code === 0 ? resolveRun() : reject(new Error('Worker failed')));
});
const job = await readJob(queued.id);
assert.equal(job.status, 'ready', job.error);
assert.equal(job.sourceSha256, source.sha256);
assert.equal(sha256(await readFile(sourcePath)), source.sha256);
assert.equal(job.result.components.length, 2);
assert.equal(job.result.triangleCount, 78482);
await mkdir('docs/qa/representative-ring', { recursive: true });
await writeFile('docs/qa/representative-ring/cad-test.json', JSON.stringify({
  status: 'passed', sourceSha256: source.sha256, sourceUnchanged: true,
  components: job.result.components.length, triangles: job.result.triangleCount,
  previewSha256: job.result.previewSha256, posterSha256: job.result.posterSha256,
  scope: 'Local Windows Blender conversion of trusted supplied revision 3 ring; outputs private. No Appwrite upload, Linux container isolation, visual approval or publication tested.',
}, null, 2) + '\n');
console.log('PASS: real representative-ring GLB conversion, component/triangle counts and unchanged source hash; output remains private.');
