import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newListing, listingInput, approveListing, publicListing, uploadInput, changeListing } from '../src/lib/jeweller-listing.ts';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url), ts = require('typescript');
const id = '01900000-0000-4000-8000-000000000001';
const profile = '01900000-0000-4000-8000-000000000002';
const details = { name: 'Private fixture ring', category: 'ring', priceMode: 'fixed', amount: '1250.50', currency: 'BWP', madeIn: 'Botswana', gemstones: [{ name: 'Ruby', origin: 'Mozambique' }], rightsConfirmed: true, provenanceNotes: 'Private acquisition note, never public' };
const review = { priceChecked: true, originChecked: true, rightsChecked: true, technicalChecked: true, visualChecked: true, madeInVerified: false, gemstoneOriginsVerified: [false], evidenceIds: [], notes: 'QA fixture only: no genuine business or verification claim.' };
function submission() {
  const listing = newListing(id, profile, details); listing.status = 'submitted';
  listing.files = ['source', 'preview', 'poster', 'evidence'].map((kind, i) => ({ id: `01900000-0000-4000-8000-00000000000${i + 3}`, kind, name: kind === 'source' ? 'private-original.3dm' : kind === 'preview' ? 'preview.glb' : kind === 'poster' ? 'poster.png' : 'private-origin.pdf', bytes: 30, sha256: String(i).repeat(64), parts: [{ id: 'private-storage-key', bytes: 30, sha256: 'a'.repeat(64) }], complete: true, createdAt: '2026-10-28T00:00:00Z' }));
  return listing;
}
test('new submissions are private drafts and cannot forge owner, review or publication fields', () => {
  assert.equal(newListing(id, profile, details).status, 'draft');
  for (const field of ['status', 'jewellerId', 'review', 'madeInVerified']) assert.throws(() => newListing(id, profile, { ...details, [field]: true }));
});
test('price amounts, real currencies and currency decimal precision are validated', () => {
  for (const amount of ['-1', '0', 'NaN', '1e5', '1.234', '10000000000']) assert.throws(() => listingInput.parse({ ...details, amount }));
  assert.throws(() => listingInput.parse({ ...details, currency: 'ZZZ' }));
  assert.throws(() => listingInput.parse({ ...details, currency: 'JPY', amount: '10.50' }));
  assert.equal(listingInput.parse({ name: 'Inquiry only', category: 'accessory' }).priceMode, 'on_request');
});
test('native CAD, exported previews, product images and evidence have separate upload types and bounds', () => {
  const f = { kind: 'source', name: 'design.3dm', bytes: 20, sha256: 'a'.repeat(64) };
  assert.equal(uploadInput(f).kind, 'source');
  for (const name of ['design.step', '../design.glb', 'design.html', 'script.blend', 'test.zip']) assert.throws(() => uploadInput({ ...f, name }));
  assert.throws(() => uploadInput({ ...f, kind: 'preview' }));
  assert.throws(() => uploadInput({ ...f, bytes: 101 * 1024 * 1024 }));
  assert.throws(() => uploadInput({ ...f, kind: 'poster', name: 'poster.png', bytes: 5 * 1024 * 1024 }));
});
test('approval requires a submission, rights, complete source and separate complete display artifacts', () => {
  assert.throws(() => approveListing(newListing(id, profile, details), review));
  for (const kind of ['source', 'preview', 'poster']) { const l = submission(); l.files.find(f => f.kind === kind).complete = false; assert.throws(() => approveListing(l, review)); }
  for (const key of ['priceChecked', 'originChecked', 'rightsChecked', 'technicalChecked', 'visualChecked']) assert.throws(() => approveListing(submission(), { ...review, [key]: false }));
  assert.equal(approveListing(submission(), review).madeInVerified, false);
});
test('origin cannot be verified without a declaration and evidence belonging to that listing', () => {
  const l = submission(), evidence = l.files.find(f => f.kind === 'evidence').id;
  assert.throws(() => approveListing(l, { ...review, madeInVerified: true }));
  assert.throws(() => approveListing(l, { ...review, madeInVerified: true, evidenceIds: [profile] }));
  l.details.madeIn = ''; assert.throws(() => approveListing(l, { ...review, madeInVerified: true, evidenceIds: [evidence] }));
  l.details.gemstones[0].origin = ''; assert.throws(() => approveListing(l, { ...review, gemstoneOriginsVerified: [true], evidenceIds: [evidence] }));
  assert.throws(() => approveListing(l, { ...review, gemstoneOriginsVerified: [] }));
});
test('public projection exposes prices and labelled declarations but never originals, evidence, private notes or account identities', () => {
  const l = submission(); l.review = approveListing(l, review); l.status = 'published';
  const result = publicListing(l, 'Fixture studio');
  assert.deepEqual(result.price, { amount: 1250.5, currency: 'BWP' });
  assert.deepEqual(result.madeIn, { country: 'Botswana', verified: false });
  assert.equal(result.gemstones[0].verified, false);
  for (const value of ['private-origin.pdf', 'private-original.3dm', 'private-storage-key', details.provenanceNotes, profile]) assert.ok(!JSON.stringify(result).includes(value));
  assert.ok(result.previewUrl.includes(l.files.find(f => f.kind === 'preview').id));
  l.status = 'needs_revision'; assert.throws(() => publicListing(l, 'Fixture studio'));
});
test('public projection also rejects tampered review state and incomplete display files', () => {
  const l = submission(); l.status = 'published'; l.review = { ...review, visualChecked: false }; assert.throws(() => publicListing(l, 'Fixture'));
  l.review = review; l.files.find(f => f.kind === 'preview').complete = false; assert.throws(() => publicListing(l, 'Fixture'));
});
test('audit revisions increment without accepting a caller supplied actor or timestamp', () => {
  const l = submission(), changed = changeListing(l, { status: 'needs_revision', review: null }, 'request_revision', 'owner', 'Evidence missing');
  assert.equal(changed.version, l.version + 1); assert.equal(changed.audit.at(-1).actor, 'owner'); assert.equal(changed.audit.at(-1).reason, 'Evidence missing');
});
test('worker access uses a distinct bearer capability and rejects missing, stale and unrelated leases', () => {
  class ChatError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const exports = {}, secret = 'w'.repeat(64);
  const compiled = ts.transpileModule(readFileSync('src/lib/jeweller-worker.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(compiled, { exports, require: name => name === './chat-security' ? { ChatError } : require(name), Buffer, process: { env: { AMES_LISTING_WORKER_TOKEN: secret } }, Date });
  assert.throws(() => exports.workerAuthorization(new Request('https://ames.test', { headers: { cookie: 'adb_session=owner' } })), e => e.status === 401);
  exports.workerAuthorization(new Request('https://ames.test', { headers: { authorization: `Bearer ${secret}` } }));
  const l = submission(); l.conversion = { status: 'processing', lease: 'expected', leaseUntil: new Date(Date.now() + 60000).toISOString(), sourceId: id, units: 'mm' };
  assert.throws(() => exports.workerLease(l, 'different'), e => e.status === 409); exports.workerLease(l, 'expected');
  l.conversion.leaseUntil = '2020-01-01T00:00:00Z'; assert.throws(() => exports.workerLease(l, 'expected'), e => e.status === 409);
  l.conversion.status = 'ready'; assert.throws(() => exports.workerLease(l, 'expected'), e => e.status === 409);
});
