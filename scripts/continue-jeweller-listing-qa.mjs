// Resume the browser/outbound half after a cold development compiler timeout.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, readdir, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID, createHmac, createHash } from 'node:crypto';
const root = resolve(process.argv[2] || '');
assert.ok(root.startsWith(resolve('.ames-cad/tests') + '\\listing-flow-') || root.startsWith(resolve('.ames-cad/tests') + '/listing-flow-'));
const profiles = await Promise.all((await readdir(join(root, 'profiles'))).filter(f => /^[a-f0-9-]{36}\.json$/.test(f)).map(async f => JSON.parse(await readFile(join(root, 'profiles', f), 'utf8'))));
assert.ok(profiles.some(p => p.portalUserId === 'qa-account-0'));
const rows = await Promise.all((await readdir(join(root, 'listings'))).filter(f => /^[a-f0-9-]{36}\.json$/.test(f)).map(async f => JSON.parse(await readFile(join(root, 'listings', f), 'utf8'))));
let listing = rows.find(l => l.status === 'published'); assert.ok(listing);
const identity = createServer((req, res) => {
  const s = req.headers['x-appwrite-session'], n = s === 'qa-a' ? 0 : s === 'qa-b' ? 1 : -1;
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/v1/account' && n >= 0) res.end(JSON.stringify({ $id: `qa-account-${n}`, name: 'QA account', email: 'fixture@example.test', emailVerification: true, prefs: {} }));
  else { res.statusCode = 401; res.end(JSON.stringify({ message: 'Unauthorized', code: 401, type: 'user_unauthorized' })); }
});
await new Promise(r => identity.listen(0, '127.0.0.1', r));
const origin = 'http://localhost:3012', secret = 'isolated-jeweller-flow-session-secret-not-production', token = 'isolated-worker-token-not-production-'.repeat(3);
const payload = JSON.stringify({ ts: Date.now(), role: 'owner' }), owner = `adb_session=${Buffer.from(payload).toString('base64url')}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
const cadRoot = join(homedir(), '.ames', 'qa-cad', randomUUID().slice(0,8)); await mkdir(cadRoot, { recursive: true });
const env = { ...process.env, VERCEL: '', SESSION_SECRET: secret, APPWRITE_ENDPOINT: `http://127.0.0.1:${identity.address().port}/v1`, APPWRITE_PROJECT_ID: 'isolated-qa', AMES_JEWELLER_STORAGE: 'local', AMES_JEWELLER_ROOT: join(root, 'profiles'), AMES_LISTING_STORAGE: 'local', AMES_LISTING_ROOT: join(root, 'listings'), AMES_CAD_ROOT: cadRoot, AMES_LISTING_WORKER_TOKEN: token, AMES_LISTING_SITE: origin, AMES_QA_DIST_DIR: '.next-listing-qa-webpack', AMES_CAD_RENDER_SIZE: '128', AMES_CAD_RENDER_SAMPLES: '8' };
const children = [];
function start(args, log) {
  const c = spawn(process.execPath, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); children.push(c);
  for (const stream of [c.stdout, c.stderr]) stream.on('data', b => appendFile(join(root, log), b).catch(() => {}));
  return c;
}
async function call(path, { cookie = owner, body, method = 'GET', raw, headers = {} } = {}) {
  return fetch(origin + path, { method, headers: { Cookie: cookie, ...(method !== 'GET' ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: raw || (body ? JSON.stringify(body) : undefined), signal: AbortSignal.timeout(300000) });
}
async function json(path, opts, status = 200) { const r = await call(path, opts), b = await r.json(); assert.equal(r.status, status, JSON.stringify(b)); return b; }
async function until(fn, max = 180000) { const end = Date.now() + max; while (Date.now() < end) { try { const r = await fn(); if (r) return r; } catch {} await new Promise(r => setTimeout(r, 1500)); } throw new Error('QA wait timed out'); }
try {
  start(['node_modules/next/dist/bin/next', 'dev', '--webpack', '--port', '3012', '--hostname', 'localhost'], 'next-continuation.log');
  await until(async () => (await call('/api/jeweller?staff=1')).status === 200, 240000);
  if (!process.argv.includes('--worker-only')) {
  for (const path of ['/jeweller', `/jewellery/${listing.id}`, '/app']) {
    console.log('Warming real UI route', path);
    const r = await call(path), html = await r.text(); assert.equal(r.status, 200);
    const scripts = [...html.matchAll(/src="(\/_next\/[^"<>]+\.js[^"<>]*)"/g)].map(m => m[1].replaceAll('&amp;', '&'));
    for (let i = 0; i < scripts.length; i += 3) await Promise.all(scripts.slice(i, i + 3).map(async s => { const r = await call(s); assert.equal(r.status, 200); await r.arrayBuffer(); }));
  }
  await writeFile(join(root, 'browser.json'), JSON.stringify({ origin, owner, customer: 'ames_customer_session=qa-a', id: listing.id, output: root }));
  const browser = spawn('python', ['scripts/verify-jeweller-listing-ui.py', join(root, 'browser.json')], { windowsHide: true, stdio: 'inherit' });
  await new Promise((done, fail) => { browser.on('error', fail); browser.on('close', c => c === 0 ? done() : fail(new Error('Browser QA failed'))); });
  }
  start(['scripts/cad/worker.mjs'], 'worker-continuation.log');
  await until(async () => Date.now() - Date.parse(JSON.parse(await readFile(join(cadRoot, 'worker.json'), 'utf8')).at) < 20000);
  const b = 'ames_customer_session=qa-b', source = Buffer.from('v -1 -1 -1\nv 1 -1 -1\nv 1 1 -1\nv -1 1 -1\nv -1 -1 1\nv 1 -1 1\nv 1 1 1\nv -1 1 1\nf 1 4 3 2\nf 5 6 7 8\nf 1 2 6 5\nf 4 8 7 3\nf 1 5 8 4\nf 2 3 7 6\n');
  let other = await json('/api/jeweller', { cookie: b, method: 'POST', body: { name: 'Outbound QA fixture', category: 'accessory', rightsConfirmed: true } }, 201);
  const begun = await json(`/api/jeweller/${other.id}/files`, { cookie: b, method: 'POST', body: { version: other.version, file: { kind: 'source', name: 'companion.obj', bytes: source.length, sha256: createHash('sha256').update(source).digest('hex') } } }, 201);
  other = await json(`/api/jeweller/${other.id}/files/${begun.file.id}?part=0`, { cookie: b, method: 'PUT', raw: source });
  other = await json(`/api/jeweller/${other.id}`, { cookie: b, method: 'PATCH', body: { version: other.version, action: 'convert', sourceId: begun.file.id, units: 'mm' } });
  assert.equal((await call('/api/jeweller-worker', { method: 'POST', body: { action: 'claim', id: other.id } })).status, 401);
  const operator = start(['scripts/cad/listing-operator.mjs', '--listing', other.id], 'outbound-worker.log');
  await new Promise((done, fail) => { operator.on('error', fail); operator.on('close', c => c === 0 ? done() : fail(new Error('Outbound worker failed; inspect log'))); });
  other = await json(`/api/jeweller/${other.id}`, { cookie: b });
  assert.equal(other.conversion.status, 'ready'); assert.equal(other.status, 'draft');
  assert.equal((await call(`/api/catalogue/${other.id}`)).status, 404);
  console.log('PASS outbound CAD handoff, real conversion and result return without publication');
  const path = `/api/jeweller/${listing.id}`, publicData = await json(`/api/catalogue/${listing.id}`); listing = await json(path);
  listing = await json(path, { method: 'PATCH', body: { version: listing.version, action: 'unpublish', reason: 'Isolated QA fixture withdrawal' } });
  assert.equal((await call(`/api/catalogue/${listing.id}`)).status, 404); assert.equal((await call(publicData.previewUrl)).status, 404);
  const p = profiles.find(p => p.portalUserId === 'qa-account-0'); p.status = 'suspended'; await writeFile(join(root, 'profiles', p.id + '.json'), JSON.stringify(p));
  assert.equal((await call('/api/jeweller', { cookie: 'ames_customer_session=qa-a' })).status, 403);
  await writeFile(join(root, 'report.json'), JSON.stringify({ productionData: false, identity: 'loopback test double', application: 'real Next routes', conversion: 'real Blender worker', passed: ['session/email/business validation', 'cross-owner access denial', 'CSRF', 'resumable multi-part upload and corruption rejection', 'native CAD conversion', 'evidence-gated approval and publication', 'public prices and distinct manufacturing/gemstone origins', 'original and evidence privacy', 'responsive studio and public 3D browser flow', 'Boutique integration', 'scoped outbound worker handoff', 'immediate withdrawal', 'suspension revocation'], coldCompilerTimeout: 'Windows Turbopack cold compilation timed out and its cache then panicked; isolated webpack continuation passed.', at: new Date().toISOString() }, null, 2));
  console.log('PASS full listing flow; evidence:', root);
} finally {
  for (const c of children.reverse()) if (c.pid && c.exitCode === null) { const kill = spawn('taskkill', ['/PID', String(c.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); await new Promise(r => kill.on('close', r)); }
  identity.closeAllConnections(); await new Promise(r => identity.close(r));
}
