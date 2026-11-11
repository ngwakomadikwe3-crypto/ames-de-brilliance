import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { buildStudioPack, getStudioJob, listStudioJobs, queueStudioUpload, rerenderStudioJob, studioInput } from './cad/studio.mjs';
import { atomicJson, jobDir, sha256 } from './cad/store.mjs';
import { readPackContracts } from './ames-engine-packs.mjs';

const glb = await readFile(resolve('public/ames-engine/dev-test-candidate-ring/web/jewelry.glb'));
const poster = Buffer.from('trusted-test-poster');
await mkdir('.ames-cad/tests', { recursive: true });
process.env.AMES_CAD_ROOT = await mkdtemp(resolve('.ames-cad/tests/studio-'));

test('studio queues private accessory uploads without Appwrite and lists only studio jobs', async () => {
  const job = await queueStudioUpload({ name: 'Silver cuff', category: 'accessory', units: 'mm' }, 'cuff.glb', glb);
  assert.equal(job.category, 'accessory'); assert.equal(job.status, 'queued');
  assert.equal(job.sourceSha256, sha256(glb)); assert.match(job.assetId, /^ames-accessory-/);
  assert.equal((await getStudioJob(job.id)).productId, job.productId);
  const other = { ...job, id: '01900000-0000-4000-8000-000000000001', productId: 'regular-product' };
  await mkdir(jobDir(other.id), { recursive: true }); await atomicJson(join(jobDir(other.id), 'job.json'), other);
  assert.equal((await listStudioJobs()).length, 1);
  await assert.rejects(getStudioJob(other.id), /not found/);
  await assert.rejects(getStudioJob('../outside'), /Invalid/);
});

test('native CAD and invalid metadata do not queue jobs', async () => {
  await assert.rejects(queueStudioUpload({ name: 'Cuff', category: 'accessory' }, 'cuff.3dm', glb), /Automatic preview supports/);
  await assert.rejects(queueStudioUpload({ name: 'Cuff', category: 'accessory' }, 'cuff.glb', Buffer.from('not a model')), /Invalid GLB/);
  assert.equal(studioInput.safeParse({ name: '', category: 'accessory' }).success, false);
  assert.equal(studioInput.safeParse({ name: 'Cuff', category: '../outside' }).success, false);
});

test('downloaded review packs have matching contracts, valid checksums and no publication approval', async () => {
  const job = (await listStudioJobs())[0];
  job.status = 'ready';
  job.result = { previewSha256: sha256(glb), posterSha256: sha256(poster), components: [], triangleCount: 12, limitations: ['Scale unverified'] };
  const entries = unzipSync(buildStudioPack(job, glb, poster));
  const json = name => JSON.parse(Buffer.from(entries[`${job.assetId}/${name}`]).toString());
  const hashes = json('sha256.json').files;
  for (const [name, expected] of Object.entries(hashes)) assert.equal(sha256(entries[`${job.assetId}/${name}`]), expected);
  assert.equal(json('app/boutique.json').category, 'accessory');
  assert.equal(json('app/asset.json').visualApproval, 'pending');
  assert.equal(json('quality-report.json').browserValidationPassed, false);
  assert.equal(json('quality-report.json').commercialVisualApproval, 'pending');
  assert.equal(Object.keys(entries).some(name => /source\.glb$/.test(name)), false);
  const folder = await mkdtemp(join(tmpdir(), 'ames-review-pack-'));
  for (const [name, bytes] of Object.entries(entries)) {
    const { writeFile } = await import('node:fs/promises');
    const target = join(folder, name); await mkdir(join(target, '..'), { recursive: true }); await writeFile(target, bytes);
  }
  const pack = await readPackContracts(join(folder, job.assetId));
  assert.equal(pack.chat.assetId, job.assetId); assert.equal(pack.media.publicationStatus, 'review');
  assert.throws(() => buildStudioPack({ ...job, status: 'queued' }, glb, poster), /ready/);
  assert.throws(() => buildStudioPack(job, Buffer.from('corrupt'), poster), /checksum/);
});

test('existing owner code remains usable during database outages without accepting prototype keys', async () => {
  const { default: ts } = await import('typescript');
  const { default: vm } = await import('node:vm');
  const crypto = await import('node:crypto');
  const source = await readFile('src/app/api/auth/login/route.ts', 'utf8');
  const sessionSource = await readFile('src/lib/staff-session.ts', 'utf8');
  const sessions = {};
  vm.runInNewContext(ts.transpileModule(sessionSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    exports: sessions, Buffer, process: { env: { SESSION_SECRET: 'test-signing-secret-that-is-long-enough' } }, require: () => crypto,
  });
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    exports, Buffer, process: { env: { SESSION_SECRET: 'test-signing-secret-that-is-long-enough', OWNER_CODE: 'test-owner-code' } },
    require: name => name === '@/lib/staff-session' ? sessions : name === 'crypto' ? crypto : name === 'next/server' ? { NextResponse: { json: Response.json } } : { getStaffByCodeAndPassword: async () => { throw Error('offline'); } },
  });
  const response = await exports.POST({ json: async () => ({ code: 'test-owner-code' }) });
  assert.equal(response.status, 200); assert.equal(sessions.getSessionRole(response.headers.get('set-cookie')), 'owner');
  assert.equal((await exports.POST({ json: async () => ({ code: 'toString' }) })).status, 401);
  assert.equal((await exports.POST({ json: async () => ({ code: {} }) })).status, 400);
});


test('latest-settings render creates a separate revision from checksum-verified source', async () => {
  const original = await queueStudioUpload({ name: 'Iced watch', category: 'watch', units: 'mm' }, 'watch.glb', glb);
  await assert.rejects(rerenderStudioJob(original.id), /already rendering/);
  await atomicJson(join(jobDir(original.id), 'job.json'), { ...original, status: 'ready' });
  const updated = await rerenderStudioJob(original.id);
  assert.notEqual(updated.id, original.id);
  assert.equal(updated.category, 'watch');
  assert.equal(updated.sourceSha256, original.sourceSha256);
  assert.equal(updated.status, 'queued');
  assert.equal((await getStudioJob(original.id)).status, 'ready');
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(jobDir(original.id), 'source.glb'), 'corrupted');
  await assert.rejects(rerenderStudioJob(original.id), /checksum/);
});
