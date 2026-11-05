/** Isolated integration: genuine Next routes/private storage/native Blender;
 * only Appwrite account identity is supplied by a loopback test double.
 * No production users, documents, email or public listings are created.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID, createHash, createHmac } from 'node:crypto';
import { newProfile, reviewProfile, blankChecks } from '../src/lib/jeweller-profile.ts';
const root = resolve('.ames-cad/tests', `listing-flow-${randomUUID()}`), profilesRoot = join(root, 'profiles'), cadRoot = join(root, 'cad');
await mkdir(profilesRoot, { recursive: true }); await mkdir(cadRoot, { recursive: true });
const secret = 'isolated-jeweller-flow-session-secret-not-production';
const workerToken = 'isolated-worker-token-not-production-'.repeat(3);
const profileIds = [randomUUID(), randomUUID(), randomUUID()];
for (let n = 0; n < profileIds.length; n++) {
  const input = { businessName: `QA fixture studio ${n}`, legalName: 'Test only representative', registrationNumber: 'QA-NOT-A-BUSINESS', email: `fixture-${n}@example.test`, phone: '+26777123456', country: 'Botswana', city: 'QA city', address: 'Fixture only address', biography: 'This is an isolated test fixture. It is not a real jeweller business or real verification finding.', specialties: ['CAD'], consentConfirmed: true, eligibilityReason: 'Isolated automated fixture, not a real business eligibility finding.' };
  const p = newProfile(profileIds[n], input);
  p.files = ['identity', 'business', 'portfolio', 'portfolio', 'portfolio'].map((kind, i) => ({ id: randomUUID(), kind, filename: 'fixture.png', mime: 'image/png', bytes: 20, sha256: String(i).repeat(64), uploadedAt: new Date().toISOString(), expiresOn: '' }));
  const submitted = reviewProfile(p, { action: 'submit' });
  const verified = reviewProfile(submitted, { action: 'verify', checks: Object.fromEntries(Object.keys(blankChecks()).map(k => [k, true])), reason: 'Isolated QA fixture only, not genuine verification.', validUntil: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10) });
  verified.portalUserId = `qa-account-${n}`;
  if (n === 2) verified.verifiedUntil = '2020-01-01';
  await writeFile(join(profilesRoot, `${verified.id}.json`), JSON.stringify(verified));
}
const identity = createServer((req, res) => {
  const session = req.headers['x-appwrite-session'];
  const n = session === 'qa-a' ? 0 : session === 'qa-b' ? 1 : session === 'qa-expired' ? 2 : -1;
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/v1/account' && (n >= 0 || session === 'qa-unverified')) { res.end(JSON.stringify({ $id: `qa-account-${Math.max(n, 0)}`, name: 'QA account', email: 'fixture@example.test', emailVerification: session !== 'qa-unverified', prefs: {} })); }
  else { res.statusCode = 401; res.end(JSON.stringify({ message: 'Fixture session expired', code: 401, type: 'user_unauthorized' })); }
});
await new Promise(done => identity.listen(0, '127.0.0.1', done));
const origin = 'http://localhost:3012';
const env = { ...process.env, VERCEL: '', SESSION_SECRET: secret, APPWRITE_ENDPOINT: `http://127.0.0.1:${identity.address().port}/v1`, APPWRITE_PROJECT_ID: 'isolated-qa',
  AMES_JEWELLER_STORAGE: 'local', AMES_JEWELLER_ROOT: profilesRoot, AMES_LISTING_STORAGE: 'local', AMES_LISTING_ROOT: join(root, 'listings'), AMES_CAD_ROOT: cadRoot,
  AMES_LISTING_WORKER_TOKEN: workerToken, AMES_QA_DIST_DIR: '.next-listing-qa', AMES_CAD_RENDER_SIZE: '256' };
const children = [];
function start(args, file, childEnv = env) {
  const child = spawn(process.execPath, args, { cwd: process.cwd(), env: childEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child);
  for (const stream of [child.stdout, child.stderr]) stream.on('data', b => appendFile(join(root, file), b).catch(() => {}));
  return child;
}
const signed = role => { const data = JSON.stringify({ ts: Date.now(), role }); return `adb_session=${Buffer.from(data).toString('base64url')}.${createHmac('sha256', secret).update(data).digest('base64url')}`; };
const owner = signed('owner'), cousin = signed('cousin'), a = 'ames_customer_session=qa-a', b = 'ames_customer_session=qa-b';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function call(path, { cookie, body, method = 'GET', raw, headers = {} } = {}) {
  return fetch(origin + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method !== 'GET' ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: raw || (body ? JSON.stringify(body) : undefined), signal: AbortSignal.timeout(90000) });
}
async function json(path, opts, status = 200) { const r = await call(path, opts), data = await r.json(); assert.equal(r.status, status, `${path}: ${JSON.stringify(data)}`); return data; }
async function until(fn, limit = 180000) { const end = Date.now() + limit; for (;;) { try { const value = await fn(); if (value) return value; } catch {} if (Date.now() > end) throw new Error('QA wait timed out'); await new Promise(r => setTimeout(r, 1000)); } }
const details = { name: 'Isolated QA jewellery', category: 'ring', description: 'Automated local fixture, not an actual offer.', priceMode: 'fixed', amount: '2450.00', currency: 'BWP', madeIn: 'South Africa', gemstones: [{ name: 'Ruby', origin: 'Mozambique' }], provenanceNotes: 'PRIVATE-NOTE-NOT-PUBLIC', rightsConfirmed: true };
let assertions = [];
try {
  start(['node_modules/next/dist/bin/next', 'dev', '--port', '3012', '--hostname', 'localhost'], 'next.log');
  await until(async () => (await call('/api/jeweller?staff=1')).status === 403, 240000);
  assert.equal((await call('/api/jeweller')).status, 401);
  assert.equal((await call('/api/jeweller', { cookie: 'ames_customer_session=qa-unverified' })).status, 403);
  assert.equal((await call('/api/jeweller', { cookie: 'ames_customer_session=qa-expired' })).status, 403);
  assert.equal((await call('/api/jeweller?staff=1', { cookie: cousin })).status, 403);
  assert.equal((await call('/api/jeweller', { cookie: a, method: 'POST', body: details, headers: { Origin: 'https://elsewhere.invalid' } })).status, 403);
  const initial = await json('/api/jeweller', { cookie: a, method: 'POST', body: details }, 201); let listing = initial;
  const path = `/api/jeweller/${listing.id}`;
  assert.equal((await call(path, { cookie: b })).status, 404);
  assert.equal((await call(path, { cookie: a, method: 'PATCH', body: { action: 'approve', version: listing.version, review: {} } })).status, 403);
  assert.equal((await call(path, { cookie: a, method: 'PATCH', body: { action: 'save', version: listing.version, details: { ...details, status: 'published' } } })).status, 400);
  assertions.push('Real session verification, expired business/email denial, cross-owner isolation, staff role and CSRF boundaries');
  const cube = 'v -1 -1 -1\nv 1 -1 -1\nv 1 1 -1\nv -1 1 -1\nv -1 -1 1\nv 1 -1 1\nv 1 1 1\nv -1 1 1\nf 1 4 3 2\nf 5 6 7 8\nf 1 2 6 5\nf 4 8 7 3\nf 1 5 8 4\nf 2 3 7 6\n';
  const source = Buffer.from(cube + '#' + ' '.repeat(3 * 1024 * 1024 + 120) + '\n');
  async function upload(row, kind, name, bytes, who = a) {
    const start = await json(`/api/jeweller/${row.id}/files`, { cookie: who, method: 'POST', body: { version: row.version, file: { kind, name, bytes: bytes.length, sha256: sha(bytes) } } }, 201);
    let value = start.listing;
    for (let index = 0; index * start.chunkSize < bytes.length; index++) value = await json(`/api/jeweller/${row.id}/files/${start.file.id}?part=${index}`, { cookie: who, method: 'PUT', raw: bytes.subarray(index * start.chunkSize, (index + 1) * start.chunkSize), headers: { 'Content-Type': 'application/octet-stream' } });
    return value;
  }
  const started = await json(`${path}/files`, { cookie: a, method: 'POST', body: { version: listing.version, file: { kind: 'source', name: 'fixture.obj', bytes: source.length, sha256: sha(source) } } }, 201);
  const sourceId = started.file.id, filePath = `${path}/files/${sourceId}`;
  listing = await json(filePath + '?part=0', { cookie: a, method: 'PUT', raw: source.subarray(0, started.chunkSize) });
  const partCount = listing.files[0].parts.length;
  listing = await json(filePath + '?part=0', { cookie: a, method: 'PUT', raw: source.subarray(0, started.chunkSize) });
  assert.equal(listing.files[0].parts.length, partCount);
  assert.equal((await call(filePath + '?part=2', { cookie: a, method: 'PUT', raw: Buffer.from('wrong order') })).status, 400);
  assert.equal((await call(filePath + '?part=1', { cookie: a, method: 'PUT', raw: Buffer.alloc(source.length - started.chunkSize, 33) })).status, 400);
  listing = await json(filePath + '?part=1', { cookie: a, method: 'PUT', raw: source.subarray(started.chunkSize) });
  assert.equal(listing.files[0].complete, true);
  assert.equal(sha(Buffer.from(await (await call(filePath, { cookie: a })).arrayBuffer())), sha(source));
  assert.equal((await call(filePath, { cookie: b })).status, 404);
  assert.equal((await call(`/api/catalogue/${listing.id}`)).status, 404);
  assert.equal((await call(filePath + '?part=0', { cookie: a, method: 'PUT', raw: Buffer.alloc(4 * 1024 * 1024) })).status, 400);
  assertions.push('Real multi-request upload above 3 MB, idempotent retry, wrong order/corruption/oversize rejection and private source checksum');
  start(['scripts/cad/worker.mjs'], 'blender-worker.log');
  await until(async () => Date.now() - Date.parse(JSON.parse(await readFile(join(cadRoot, 'worker.json'), 'utf8')).at) < 20000);
  listing = await json(path, { cookie: a, method: 'PATCH', body: { version: listing.version, action: 'convert', sourceId, units: 'mm' } });
  assert.equal(listing.conversion.status, 'queued'); assert.equal(listing.conversion.jobId, undefined);
  listing = await json(path, { cookie: owner, method: 'PATCH', body: { version: listing.version, action: 'convert', sourceId, units: 'mm' } });
  assert.ok(listing.conversion.jobId);
  listing = await until(async () => { const value = await json(path, { cookie: a }); return value.conversion.status === 'ready' ? value : false; }, 360000);
  assert.ok(listing.files.some(f => f.kind === 'preview' && f.complete)); assert.ok(listing.files.some(f => f.kind === 'poster' && f.complete));
  assertions.push('Genuine staff-operated Blender conversion, source binding and derivative artifacts returning to the private listing');
  listing = await upload(listing, 'evidence', 'fixture-evidence.pdf', Buffer.from('%PDF-1.4\nIsolated provenance fixture only\n%%EOF'));
  listing = await json(path, { cookie: a, method: 'PATCH', body: { version: listing.version, action: 'submit' } });
  const review = { priceChecked: true, originChecked: true, rightsChecked: true, technicalChecked: true, visualChecked: true, madeInVerified: true, gemstoneOriginsVerified: [true], evidenceIds: [], notes: 'Isolated QA only: this does not verify an actual commercial origin.' };
  assert.equal((await call(path, { cookie: owner, method: 'PATCH', body: { version: listing.version, action: 'approve', review } })).status, 400);
  review.evidenceIds = [listing.files.find(f => f.kind === 'evidence').id];
  listing = await json(path, { cookie: owner, method: 'PATCH', body: { version: listing.version, action: 'approve', review } });
  assert.equal((await json('/api/catalogue')).listings.length, 0);
  listing = await json(path, { cookie: owner, method: 'PATCH', body: { version: listing.version, action: 'publish' } });
  const published = await json(`/api/catalogue/${listing.id}`);
  assert.deepEqual(published.price, { amount: 2450, currency: 'BWP' }); assert.equal(published.madeIn.country, 'South Africa'); assert.equal(published.gemstones[0].origin, 'Mozambique');
  assert.equal(published.madeIn.verified, true);
  for (const value of ['PRIVATE-NOTE-NOT-PUBLIC', 'fixture-evidence.pdf', profileIds[0]]) assert.ok(!JSON.stringify(published).includes(value));
  for (const f of listing.files.filter(f => ['source', 'evidence'].includes(f.kind))) assert.equal((await call(`/api/catalogue/${listing.id}/files/${f.id}`)).status, 404);
  assert.equal((await call(published.previewUrl)).status, 200);
  assert.equal((await call(path, { cookie: a, method: 'PATCH', body: { version: listing.version, action: 'save', details } })).status, 400);
  assertions.push('Evidence-gated staff approval, separate publication, public pricing/origins and no original/evidence/private-note exposure');
  await writeFile(join(root, 'browser.json'), JSON.stringify({ origin, owner, customer: a, id: listing.id, output: root }));
  const visual = spawn('python', ['scripts/verify-jeweller-listing-ui.py', join(root, 'browser.json')], { cwd: process.cwd(), windowsHide: true, stdio: 'inherit' });
  await new Promise((done, fail) => { visual.on('error', fail); visual.on('close', c => c === 0 ? done() : fail(new Error('Listing browser flow failed'))); });
  assertions.push('Actual browser draft form, responsive public price/origin view and Boutique selection');
  let other = await json('/api/jeweller', { cookie: b, method: 'POST', body: { ...details, name: 'Isolated outbound handoff fixture' } }, 201);
  other = await upload(other, 'source', 'companion.obj', Buffer.from(cube), b);
  other = await json(`/api/jeweller/${other.id}`, { cookie: b, method: 'PATCH', body: { version: other.version, action: 'convert', sourceId: other.files[0].id, units: 'mm' } });
  assert.equal((await call('/api/jeweller-worker', { cookie: owner, method: 'POST', body: { action: 'claim', id: other.id } })).status, 401);
  const operator = start(['scripts/cad/listing-operator.mjs', '--listing', other.id], 'outbound-worker.log', { ...env, AMES_LISTING_SITE: origin });
  await new Promise((done, fail) => { const timer = setTimeout(() => fail(new Error('Outbound operator timed out')), 420000); operator.on('error', fail); operator.on('close', c => { clearTimeout(timer); c === 0 ? done() : fail(new Error('Outbound worker failed; inspect test log')); }); });
  other = await json(`/api/jeweller/${other.id}`, { cookie: b });
  assert.equal(other.conversion.status, 'ready'); assert.equal(other.status, 'draft'); assert.equal((await call(`/api/catalogue/${other.id}`)).status, 404);
  assertions.push('Outbound source download, native conversion, chunked result return; worker cannot publish and has no staff-cookie authority');
  listing = await json(path, { cookie: owner, method: 'PATCH', body: { version: listing.version, action: 'unpublish', reason: 'Isolated QA fixture withdrawal' } });
  assert.equal((await call(`/api/catalogue/${listing.id}`)).status, 404); assert.equal((await call(published.previewUrl)).status, 404); assert.equal((await json('/api/catalogue')).listings.length, 0);
  const p = JSON.parse(await readFile(join(profilesRoot, profileIds[0] + '.json'), 'utf8')); p.status = 'suspended'; await writeFile(join(profilesRoot, p.id + '.json'), JSON.stringify(p));
  assert.equal((await call('/api/jeweller', { cookie: a })).status, 403);
  assertions.push('Immediate public withdrawal and business suspension revocation');
  await writeFile(join(root, 'report.json'), JSON.stringify({ passed: assertions, identity: 'loopback Appwrite test double', application: 'real Next routes', conversion: 'real Blender worker', productionData: false, at: new Date().toISOString() }, null, 2));
  console.log('PASS isolated listing end-to-end flow', JSON.stringify({ evidence: root, checks: assertions.length }));
} finally {
  for (const child of children.reverse()) {
    if (!child.pid || child.exitCode !== null) continue;
    if (process.platform === 'win32') { const kill = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); await new Promise(r => kill.on('close', r)); }
    else child.kill('SIGTERM');
  }
  identity.closeAllConnections(); await new Promise(r => identity.close(r));
}
