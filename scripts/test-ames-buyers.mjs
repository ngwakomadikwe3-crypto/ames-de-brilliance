/**
 * Buyer-accounts suite (node:test, Node >= 22 strip-types).
 *
 * Covers: session channel separation, OTP security (expiry, single-use,
 * brute-force, shared-store rate limits), lifecycle decisions with licence
 * verification stamping, the catalogue access resolver behind
 * CATALOGUE_PUBLIC_ACCESS, the offer-access predicate (amendment 2), the
 * staff-role authz matrix, IDOR resistance, document sniffing + signed links,
 * export/anonymisation, audited document views, and same-origin enforcement.
 *
 * All fixtures are invented people (example.test) — no real personal data,
 * no real ID documents.
 *
 * Route-handler authz is asserted statically (route source must call its
 * guard) plus behaviourally at the service/store level; HTTP-level checks
 * run in the smoke script against staging.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// SESSION_SECRET must exist BEFORE session.ts is imported (read at load).
const SECRET = 'buyer-test-secret-0123456789abcdef0123456789abcdef';
process.env.SESSION_SECRET = SECRET;
delete process.env.CATALOGUE_PUBLIC_ACCESS;

const staffSession = await import('../src/lib/session.ts');
const buyerSession = await import('../src/lib/buyers/session.ts');
const { MemoryBuyerStore } = await import('../src/lib/buyers/memory-store.ts');
const otp = await import('../src/lib/buyers/otp.ts');
const service = await import('../src/lib/buyers/service.ts');
const authz = await import('../src/lib/buyers/authz.ts');
const docs = await import('../src/lib/buyers/documents.ts');
const { BUYER_TERMS_VERSION } = await import('../src/lib/buyers/terms.ts');
const access = await import('../src/lib/buyers/access.ts');
const { sameOrigin } = await import('../src/lib/same-origin.ts');

const NOW = new Date('2026-10-31T12:00:00Z');

function staffToken(role) {
  const payload = JSON.stringify({ ts: Date.now(), ...(role ? { role } : {}) });
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

async function buyerToken(buyerId) {
  const cookie = await buyerSession.createBuyerSessionCookie(buyerId, false);
  return buyerSession.buyerTokenFromCookieHeader(cookie);
}

function alice(store) {
  return service.registerBuyer(store, {
    id: 'buyer-alice', name: 'Alice Example', email: 'alice@example.test',
    phone: '+267 7000 0001', country: 'Botswana', entityType: 'individual',
    licenceNumber: 'TEST-LIC-001', licenceType: 'dealer',
    licenceExpiry: '2027-12-31', termsVersion: BUYER_TERMS_VERSION,
  }, NOW);
}

/* ── 1. Session channels stay separate ── */

test('staff session: verifies; role-less signed tokens fail the staff check', async () => {
  assert.equal(await staffSession.verifySession(staffToken('owner')), true);
  assert.equal(await staffSession.verifyStaffSession(staffToken('owner')), true);
  // Validly signed but no role claim: passes plain verify, fails staff verify.
  assert.equal(await staffSession.verifySession(staffToken(null)), true);
  assert.equal(await staffSession.verifyStaffSession(staffToken(null)), false);
});

test('channel separation: buyer tokens never pass staff checks and vice versa', async () => {
  const token = await buyerToken('buyer-alice');
  assert.ok(token, 'cookie minted');
  const payload = await buyerSession.verifyBuyerSession(token);
  assert.equal(payload.buyerId, 'buyer-alice');
  assert.equal(payload.kind, 'buyer');
  // Cross-channel: the buyer cookie has no role claim -> not staff.
  assert.equal(await staffSession.verifyStaffSession(token), false);
  // And a staff token has kind != buyer -> not a buyer session.
  assert.equal(await buyerSession.verifyBuyerSession(staffToken('staff')), null);
});

test('buyer session: tampering and expiry are rejected', async () => {
  const token = await buyerToken('buyer-alice');
  const tampered = token.slice(0, -2) + (token.endsWith('a') ? 'b' : 'a') + token.slice(-1);
  assert.equal(await buyerSession.verifyBuyerSession(tampered), null);
  // Correctly signed but 9 hours old (lifetime is 8h).
  const oldPayload = Buffer.from(JSON.stringify({ ts: Date.now() - 9 * 3600_000, kind: 'buyer', buyerId: 'buyer-alice' })).toString('base64url');
  const oldSig = crypto.createHmac('sha256', SECRET).update(oldPayload).digest('base64url');
  assert.equal(await buyerSession.verifyBuyerSession(`${oldPayload}.${oldSig}`), null);
});

/* ── 2. OTP security ── */

test('OTP: request/verify roundtrip; only the HMAC of the code is stored', async () => {
  const store = new MemoryBuyerStore();
  let captured = null;
  const sent = await otp.requestOtp(store, 'alice@example.test', {
    now: NOW, ip: '127.0.0.1',
    sendCode: async (to, code) => { captured = code; return true; },
  });
  assert.equal(sent, true);
  assert.match(captured, /^[0-9]{6}$/);
  const row = await store.getOtp('alice@example.test');
  assert.notEqual(row.codeHash, captured, 'plaintext code is never stored');
  assert.equal(row.codeHash, otp.hashOtpCode('alice@example.test', captured));
  assert.equal(await otp.verifyOtp(store, 'alice@example.test', captured, NOW), 'ok');
});

test('OTP: single-use and expiry are enforced', async () => {
  const store = new MemoryBuyerStore();
  let captured = null;
  await otp.requestOtp(store, 'alice@example.test', { now: NOW, sendCode: async (to, code) => { captured = code; return true; } });
  assert.equal(await otp.verifyOtp(store, 'alice@example.test', captured, NOW), 'ok');
  assert.equal(await otp.verifyOtp(store, 'alice@example.test', captured, NOW), 'used', 'replay is refused');

  let captured2 = null;
  await otp.requestOtp(store, 'bob@example.test', { now: NOW, sendCode: async (to, code) => { captured2 = code; return true; } });
  const later = new Date(NOW.getTime() + otp.OTP_TTL_MS + 1000);
  assert.equal(await otp.verifyOtp(store, 'bob@example.test', captured2, later), 'expired');
});

test('OTP: five wrong guesses kill the code, even for the right guess after', async () => {
  const store = new MemoryBuyerStore();
  let captured = null;
  await otp.requestOtp(store, 'alice@example.test', { now: NOW, sendCode: async (to, code) => { captured = code; return true; } });
  const wrong = captured === '000000' ? '000001' : '000000';
  for (let i = 0; i < otp.OTP_MAX_ATTEMPTS; i++) {
    assert.equal(await otp.verifyOtp(store, 'alice@example.test', wrong, NOW), 'mismatch');
  }
  assert.equal(await otp.verifyOtp(store, 'alice@example.test', captured, NOW), 'too_many_attempts');
});

test('OTP: request limits are shared-store, per email (5/h) and per IP (20/h)', async () => {
  const store = new MemoryBuyerStore();
  let sends = 0;
  const sendCode = async () => { sends += 1; return true; };
  for (let i = 0; i < otp.OTP_REQUEST_LIMIT_PER_EMAIL_HOUR; i++) {
    assert.equal(await otp.requestOtp(store, 'alice@example.test', { now: NOW, ip: `10.0.0.${i}`, sendCode }), true);
  }
  assert.equal(await otp.requestOtp(store, 'alice@example.test', { now: NOW, ip: '10.9.9.9', sendCode }), false, '6th email request dropped');
  assert.equal(sends, otp.OTP_REQUEST_LIMIT_PER_EMAIL_HOUR);

  const store2 = new MemoryBuyerStore();
  let sends2 = 0;
  const sendCode2 = async () => { sends2 += 1; return true; };
  for (let i = 0; i < otp.OTP_REQUEST_LIMIT_PER_IP_HOUR; i++) {
    await otp.requestOtp(store2, `person${i}@example.test`, { now: NOW, ip: '203.0.113.7', sendCode: sendCode2 });
  }
  assert.equal(await otp.requestOtp(store2, 'onemore@example.test', { now: NOW, ip: '203.0.113.7', sendCode: sendCode2 }), false, '21st IP request dropped');
  assert.equal(sends2, otp.OTP_REQUEST_LIMIT_PER_IP_HOUR);
});

/* ── 3. Lifecycle, licence verification and terms ── */

test('lifecycle: register -> pending -> approve stamps licence verification -> suspend clears it, all audited', async () => {
  const store = new MemoryBuyerStore();
  const buyer = await alice(store);
  assert.equal(buyer.status, 'pending');
  assert.equal(buyer.licenceVerifiedAt, '', 'licence unverified at registration');
  assert.equal(service.buyerMayOffer(buyer, NOW), false, 'pending cannot offer');

  const approved = await service.decideBuyer(store, buyer.id, 'approve', 'Licence sighted', 'staff:owner', NOW);
  assert.equal(approved.status, 'verified');
  assert.equal(approved.licenceVerifiedAt, NOW.toISOString(), 'approval stamps licence verification');
  assert.equal(approved.licenceVerifiedBy, 'staff:owner');
  assert.equal(service.buyerMayOffer(approved, NOW), true);

  const suspended = await service.decideBuyer(store, buyer.id, 'suspend', 'Compliance hold', 'staff:owner', NOW);
  assert.equal(suspended.status, 'suspended');
  assert.equal(suspended.statusReason, 'Compliance hold');
  assert.equal(suspended.licenceVerifiedAt, '', 'suspension clears licence verification');
  assert.equal(suspended.licenceVerifiedBy, '');
  assert.equal(service.buyerMayOffer(suspended, NOW), false);

  const actions = store.auditTrail().map((a) => a.action);
  assert.deepEqual(actions, ['buyer.registered', 'buyer.approved', 'buyer.suspended']);
  assert.equal(store.auditTrail()[2].actor, 'staff:owner');
});

test('terms: stale acceptance blocks offers until the current version is accepted', async () => {
  const store = new MemoryBuyerStore();
  const buyer = await service.registerBuyer(store, {
    id: 'buyer-bob', name: 'Bob Example', email: 'bob@example.test',
    phone: '+267 7000 0002', country: 'Botswana', entityType: 'company',
    licenceNumber: 'TEST-LIC-002', licenceType: 'dealer', licenceExpiry: '2027-06-30',
    termsVersion: '1999-01-superseded',
  }, NOW);
  await service.decideBuyer(store, buyer.id, 'approve', 'ok', 'staff:owner', NOW);
  let current = await store.getBuyer(buyer.id);
  assert.equal(service.buyerMayOffer(current, NOW), false, 'verified but stale terms cannot offer');
  assert.equal(service.buyerStatusMessage(current, NOW).state, 'terms_stale');
  await service.acceptTerms(store, buyer.id);
  current = await store.getBuyer(buyer.id);
  assert.equal(current.termsVersion, BUYER_TERMS_VERSION);
  assert.equal(service.buyerMayOffer(current, NOW), true);
  assert.ok(store.auditTrail().some((a) => a.action === 'buyer.terms_accepted'));
});

/* ── 4. Catalogue access resolver behind CATALOGUE_PUBLIC_ACCESS ── */

test('resolver: flag OFF — anonymous denied, verified buyer browses and offers, staff browse-only', async () => {
  delete process.env.CATALOGUE_PUBLIC_ACCESS;
  const store = new MemoryBuyerStore();
  await alice(store);
  await service.decideBuyer(store, 'buyer-alice', 'approve', 'ok', 'staff:owner', NOW);

  const anonymous = await access.resolveCatalogueAccess(null, store, NOW);
  assert.equal(anonymous.access.kind, 'anonymous');
  assert.equal(anonymous.canBrowse, false, 'anonymous gets nothing while the flag is off');
  assert.equal(anonymous.canOffer, false);

  const buyer = await access.resolveCatalogueAccess(`adb_buyer=${await buyerToken('buyer-alice')}`, store, NOW);
  assert.equal(buyer.access.kind, 'buyer');
  assert.equal(buyer.canBrowse, true);
  assert.equal(buyer.canOffer, true, 'fully verified buyer may offer');

  const staff = await access.resolveCatalogueAccess(`adb_session=${staffToken('staff')}`, store, NOW);
  assert.equal(staff.access.kind, 'staff');
  assert.equal(staff.canBrowse, true);
  assert.equal(staff.canOffer, false, 'staff never make offers');
});

test('resolver: flag ON — anonymous read-only; canOffer stays false without a verified buyer', async () => {
  process.env.CATALOGUE_PUBLIC_ACCESS = '1';
  try {
    const store = new MemoryBuyerStore();
    const anonymous = await access.resolveCatalogueAccess(null, store, NOW);
    assert.equal(anonymous.canBrowse, true);
    assert.equal(anonymous.canOffer, false, 'offers always require a verified buyer');
  } finally {
    delete process.env.CATALOGUE_PUBLIC_ACCESS;
  }
});

test('resolver: suspension applies to the very next resolve; anonymised accounts fall through to anonymous', async () => {
  const store = new MemoryBuyerStore();
  await alice(store);
  await service.decideBuyer(store, 'buyer-alice', 'approve', 'ok', 'staff:owner', NOW);
  const cookie = `adb_buyer=${await buyerToken('buyer-alice')}`;

  let resolved = await access.resolveCatalogueAccess(cookie, store, NOW);
  assert.equal(resolved.canOffer, true);

  await service.decideBuyer(store, 'buyer-alice', 'suspend', 'hold', 'staff:owner', NOW);
  resolved = await access.resolveCatalogueAccess(cookie, store, NOW);
  assert.equal(resolved.access.kind, 'buyer');
  assert.equal(resolved.access.verified, false);
  assert.equal(resolved.canBrowse, false, 'suspended buyers lose catalogue access immediately');
  assert.equal(resolved.canOffer, false);

  await service.anonymiseBuyer(store, 'buyer-alice', 'staff:owner', NOW);
  resolved = await access.resolveCatalogueAccess(cookie, store, NOW);
  assert.equal(resolved.access.kind, 'anonymous', 'anonymised account resolves as anonymous');
  assert.equal(resolved.canBrowse, false);
});

test('resolver: stale terms keep browsing but block offers', async () => {
  const store = new MemoryBuyerStore();
  await service.registerBuyer(store, {
    id: 'buyer-bob', name: 'Bob Example', email: 'bob@example.test',
    phone: '', country: 'BW', entityType: 'individual',
    licenceNumber: 'TEST-LIC-002', licenceType: 'dealer', licenceExpiry: '2027-06-30',
    termsVersion: '1999-01-superseded',
  }, NOW);
  await service.decideBuyer(store, 'buyer-bob', 'approve', 'ok', 'staff:owner', NOW);
  const resolved = await access.resolveCatalogueAccess(`adb_buyer=${await buyerToken('buyer-bob')}`, store, NOW);
  assert.equal(resolved.access.kind, 'buyer');
  assert.equal(resolved.access.termsCurrent, false);
  assert.equal(resolved.canBrowse, true, 'verified buyer may still browse');
  assert.equal(resolved.canOffer, false, 'stale terms block offers');
});

/* ── 5. Offer-access predicate (amendment 2) ── */

test('buyerMayOffer: fails closed on every missing or lapsed licence condition', async () => {
  assert.equal(service.buyerMayOffer(null, NOW), false, 'no buyer');

  const store = new MemoryBuyerStore();
  await alice(store);
  const approved = await service.decideBuyer(store, 'buyer-alice', 'approve', 'ok', 'staff:owner', NOW);
  assert.equal(service.buyerMayOffer(approved, NOW), true, 'control: fully verified buyer may offer');

  const at = (patch) => ({ ...approved, ...patch });
  assert.equal(service.buyerMayOffer(at({ status: 'pending' }), NOW), false, 'pending');
  assert.equal(service.buyerMayOffer(at({ termsVersion: 'old' }), NOW), false, 'stale terms');
  assert.equal(service.buyerMayOffer(at({ licenceNumber: '' }), NOW), false, 'missing licence number');
  assert.equal(service.buyerMayOffer(at({ licenceType: '' }), NOW), false, 'missing licence type');
  assert.equal(service.buyerMayOffer(at({ licenceExpiry: '' }), NOW), false, 'missing licence expiry');
  assert.equal(service.buyerMayOffer(at({ licenceVerifiedAt: '' }), NOW), false, 'licence not staff-verified');
  assert.equal(service.buyerMayOffer(at({ licenceExpiry: '2020-01-01' }), NOW), false, 'expired licence');
  assert.equal(service.buyerMayOffer(at({ licenceExpiry: 'not-a-date' }), NOW), false, 'garbage expiry fails closed');

  const expired = at({ licenceExpiry: '2020-01-01' });
  assert.equal(service.buyerStatusMessage(expired, NOW).state, 'licence_expired');
});

test('register route: all three licence fields are required by the schema (static)', () => {
  const route = readFileSync(new URL('../src/app/api/buyers/register/route.ts', import.meta.url), 'utf8');
  assert.match(route, /licenceNumber: z\.string\(\)\.trim\(\)\.min\(2\)/);
  assert.match(route, /licenceType: z\.string\(\)\.trim\(\)\.min\(2\)/);
  assert.match(route, /licenceExpiry: z/);
  assert.match(route, /Date\.parse/, 'expiry must be a real date');
});

/* ── 6. Authz matrix ── */

test('authz matrix: only owner and staff can review or decide buyers', () => {
  const actors = [null, undefined, '', 'owner', 'staff', 'cousin', 'developer-admin', 'buyer', 'root'];
  const expectReview = { owner: true, staff: true };
  for (const role of actors) {
    assert.equal(authz.canReviewBuyers(role), expectReview[role] ?? false, `canReview(${role})`);
    assert.equal(authz.canDecideBuyers(role), expectReview[role] ?? false, `canDecide(${role})`);
  }
});

test('authz matrix: every staff route calls its guard; middleware gates staff surfaces', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const staffRoutes = [
    ['../src/app/api/staff/buyers/route.ts', /canReviewBuyers/],
    ['../src/app/api/staff/buyers/[id]/route.ts', /canReviewBuyers/],
    ['../src/app/api/staff/buyers/[id]/decision/route.ts', /canDecideBuyers/],
    ['../src/app/api/staff/buyers/[id]/export/route.ts', /canDecideBuyers/],
    ['../src/app/api/staff/buyers/[id]/anonymise/route.ts', /canDecideBuyers/],
    ['../src/app/api/staff/buyers/[id]/documents/[docId]/link/route.ts', /canReviewBuyers/],
    ['../src/app/api/staff/buyers/[id]/documents/[docId]/view/route.ts', /verifyDocumentLink/],
  ];
  for (const [path, guard] of staffRoutes) {
    assert.match(read(path), guard, `${path} must call its guard`);
    assert.match(read(path), /getStaffSessionRole|verifyDocumentLink/, `${path} must establish the staff actor`);
  }
  const mw = read('../src/middleware.ts');
  assert.match(mw, /verifyStaffSession/, 'middleware requires a staff session for staff surfaces');
  assert.match(mw, /\/api\/buyers\/:path\*/, 'buyer API inside the matcher');
  assert.match(mw, /\/api\/staff\/:path\*/, 'staff API inside the matcher');
  assert.match(mw, /sameOrigin/, 'same-origin enforcement present');
  // Previously role-blind checks now demand the staff role claim.
  assert.match(read('../src/app/api/licence-docs/[fileId]/route.ts'), /verifyStaffSession/);
  // Buyer self routes are session-scoped (no id parameter at all).
  assert.match(read('../src/app/api/buyers/me/route.ts'), /verifyBuyerSession/);
  assert.match(read('../src/app/api/buyers/documents/route.ts'), /sniffDocumentType/);
});

/* ── 7. IDOR resistance ── */

test('IDOR: document listings are scoped; signed links bind document AND buyer', async () => {
  const store = new MemoryBuyerStore();
  await alice(store);
  await service.registerBuyer(store, {
    id: 'buyer-bob', name: 'Bob Example', email: 'bob@example.test',
    phone: '', country: 'BW', entityType: 'individual',
    licenceNumber: 'TEST-LIC-002', licenceType: 'dealer', licenceExpiry: '2027-06-30',
    termsVersion: BUYER_TERMS_VERSION,
  }, NOW);
  await store.addDocument({
    id: 'doc-a', buyerId: 'buyer-alice', fileId: 'file-a', filename: 'alice-licence.pdf',
    contentType: 'application/pdf', size: 100, sha256: 'x', uploadedAt: NOW.toISOString(),
  });
  await store.addDocument({
    id: 'doc-b', buyerId: 'buyer-bob', fileId: 'file-b', filename: 'bob-licence.pdf',
    contentType: 'application/pdf', size: 100, sha256: 'y', uploadedAt: NOW.toISOString(),
  });
  assert.deepEqual((await store.listDocuments('buyer-alice')).map((d) => d.id), ['doc-a']);

  // A link minted for Alice's document carries her buyer id; the view route
  // rejects any path whose ids do not match the signed payload.
  const { token, sig } = docs.mintDocumentLink({ docId: 'doc-a', buyerId: 'buyer-alice', staff: 'staff:owner', exp: Date.now() + 60_000 });
  const payload = docs.verifyDocumentLink(token, sig);
  assert.equal(payload.buyerId, 'buyer-alice');
  assert.equal(payload.docId, 'doc-a');
  assert.notEqual(payload.buyerId, 'buyer-bob', 'cannot be replayed under another buyer path');
});

/* ── 8. Document sniffing and signed links ── */

test('documents: magic-byte allow-list; executables and scripts are refused', () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
  assert.equal(docs.sniffDocumentType(pdf), 'pdf');
  assert.equal(docs.sniffDocumentType(png), 'png');
  assert.equal(docs.sniffDocumentType(jpg), 'jpeg');
  assert.equal(docs.sniffDocumentType(webp), 'webp');
  assert.equal(docs.sniffDocumentType(new Uint8Array([0x4d, 0x5a, 0x90, 0x00])), null, 'MZ executable refused');
  assert.equal(docs.sniffDocumentType(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), null, 'ZIP refused');
  assert.equal(docs.sniffDocumentType(new TextEncoder().encode('<script>alert(1)</script>')), null, 'HTML/script refused');
  assert.equal(docs.DOCUMENT_MAX_BYTES, 20 * 1024 * 1024);
});

test('documents: signed view links expire, resist tampering, and hash check is stable', () => {
  const exp = Date.now() + docs.DOCUMENT_LINK_TTL_MS;
  const { token, sig } = docs.mintDocumentLink({ docId: 'doc-a', buyerId: 'buyer-alice', staff: 'staff:owner', exp });
  assert.ok(docs.verifyDocumentLink(token, sig));
  assert.equal(docs.verifyDocumentLink(token, sig.slice(0, -2) + 'xx'), null, 'bad signature');
  assert.equal(docs.verifyDocumentLink(token, sig, exp + 1), null, 'expired');
  assert.equal(
    docs.sha256Hex(new TextEncoder().encode('ames')),
    'a521ff61b09f20551e6ca46842fb6f0a477d6b30169dd8657916ae2c89d7fd21',
  );
});

/* ── 9. Export, anonymisation, audited views ── */

test('export includes profile + documents and is audited; every document view is audited', async () => {
  const store = new MemoryBuyerStore();
  await alice(store);
  await store.addDocument({
    id: 'doc-a', buyerId: 'buyer-alice', fileId: 'file-a', filename: 'alice-licence.pdf',
    contentType: 'application/pdf', size: 100, sha256: 'x', uploadedAt: NOW.toISOString(),
  });

  const exported = await service.exportBuyerData(store, 'buyer-alice', 'staff:owner', NOW);
  assert.equal(exported.buyer.email, 'alice@example.test');
  assert.equal(exported.documents.length, 1);
  assert.equal(exported.exportedBy, 'staff:owner');

  await service.recordDocumentView(store, {
    buyerId: 'buyer-alice', documentId: 'doc-a', filename: 'alice-licence.pdf', staffActor: 'staff:owner',
  }, NOW);

  const actions = store.auditTrail().map((a) => a.action);
  assert.ok(actions.includes('buyer.data_exported'));
  const view = store.auditTrail().find((a) => a.action === 'buyer.document_viewed');
  assert.equal(view.actor, 'staff:owner', 'view audited with the staff actor');
  assert.ok(view.createdAt, 'view audited with a timestamp');
});

test('anonymisation erases PII incl. all licence fields, keeps the row id for offer/audit integrity, blocks login', async () => {
  const store = new MemoryBuyerStore();
  await alice(store);
  await service.decideBuyer(store, 'buyer-alice', 'approve', 'ok', 'staff:owner', NOW);
  const ok = await service.anonymiseBuyer(store, 'buyer-alice', 'staff:owner', NOW);
  assert.equal(ok, true);

  const erased = await store.getBuyer('buyer-alice');
  assert.ok(erased, 'row survives under the same id (offers/audit stay linked)');
  assert.equal(erased.name, 'Deleted buyer');
  assert.equal(erased.email, 'deleted+buyer-alice@invalid');
  assert.equal(erased.phone, '');
  assert.equal(erased.licenceNumber, '');
  assert.equal(erased.licenceType, '');
  assert.equal(erased.licenceExpiry, '');
  assert.equal(erased.licenceVerifiedAt, '');
  assert.equal(erased.licenceVerifiedBy, '');
  assert.ok(erased.anonymisedAt);
  assert.equal(await store.getBuyerByEmail('alice@example.test'), null, 'old email no longer resolves');
  assert.ok(store.auditTrail().some((a) => a.action === 'buyer.anonymised' && a.actor === 'staff:owner'));
});

/* ── 10. Same-origin enforcement (ported from recovery proxy.ts) ── */

test('sameOrigin: exact-origin semantics, no-Origin denied, AMES_APP_ORIGIN honoured', () => {
  const req = (url, origin) => ({ url, headers: { get: (n) => (n.toLowerCase() === 'origin' ? (origin ?? null) : null) } });
  const saved = process.env.AMES_APP_ORIGIN;
  delete process.env.AMES_APP_ORIGIN;
  try {
    assert.equal(sameOrigin(req('https://ames.example.com/api/buyers/me', 'https://ames.example.com')), true);
    assert.equal(sameOrigin(req('https://ames.example.com/api/buyers/me', 'https://evil.example')), false);
    assert.equal(sameOrigin(req('https://ames.example.com/api/buyers/me', null)), false, 'no Origin is denied');
    process.env.AMES_APP_ORIGIN = 'https://catalogue.ames.example.com';
    assert.equal(sameOrigin(req('https://internal.local/api/buyers/me', 'https://catalogue.ames.example.com')), true);
    assert.equal(sameOrigin(req('https://catalogue.ames.example.com/api/buyers/me', 'https://catalogue.ames.example.com.evil.example')), false);
  } finally {
    if (saved === undefined) delete process.env.AMES_APP_ORIGIN;
    else process.env.AMES_APP_ORIGIN = saved;
  }
});
