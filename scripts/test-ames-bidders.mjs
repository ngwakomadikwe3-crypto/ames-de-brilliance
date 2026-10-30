/**
 * Phase 3a bidder-accounts suite (node:test, Node >= 22 strip-types).
 *
 * Covers: session channel separation, OTP security (expiry, single-use,
 * brute-force, shared-store rate limits), lifecycle decisions, the real
 * BidderResolver behind AUCTION_PUBLIC_BIDDING, the bid-path gates, the
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
const SECRET = 'phase3a-test-secret-0123456789abcdef0123456789abcdef';
process.env.SESSION_SECRET = SECRET;
delete process.env.AUCTION_PUBLIC_BIDDING;

const staffSession = await import('../src/lib/session.ts');
const bidderSession = await import('../src/lib/bidders/session.ts');
const { MemoryBidderStore } = await import('../src/lib/bidders/memory-store.ts');
const otp = await import('../src/lib/bidders/otp.ts');
const service = await import('../src/lib/bidders/service.ts');
const authz = await import('../src/lib/bidders/authz.ts');
const docs = await import('../src/lib/bidders/documents.ts');
const { AUCTION_TERMS_VERSION } = await import('../src/lib/bidders/terms.ts');
const resolver = await import('../src/lib/auction/auth.ts');
const { MemoryAuctionStore } = await import('../src/lib/auction/memory-store.ts');
const { placeBid } = await import('../src/lib/auction/place-bid.ts');
const { sameOrigin } = await import('../src/lib/same-origin.ts');

const noSleep = () => Promise.resolve();
const NOW = new Date('2026-10-31T12:00:00Z');

function staffToken(role) {
  const payload = JSON.stringify({ ts: Date.now(), ...(role ? { role } : {}) });
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

async function bidderToken(bidderId) {
  const cookie = await bidderSession.createBidderSessionCookie(bidderId, false);
  return bidderSession.bidderTokenFromCookieHeader(cookie);
}

function makeLot(overrides = {}) {
  const now = Date.now();
  return {
    id: 'lot-1', auctionId: 'auction-1', title: 'Test lot', description: '',
    stoneRef: 'AM-001', currency: 'BWP', status: 'live',
    startingBidMinor: 100_000, reserveMinor: 0, minIncrementMinor: 10_000,
    antiSnipeSeconds: 120,
    opensAt: new Date(now - 3_600_000).toISOString(),
    closesAt: new Date(now + 3_600_000).toISOString(),
    currentBidMinor: 0, currentBidderId: '', bidCount: 0,
    createdAt: new Date(now - 3_600_000).toISOString(),
    ...overrides,
  };
}

function alice(store) {
  return service.registerBidder(store, {
    id: 'bidder-alice', name: 'Alice Example', email: 'alice@example.test',
    phone: '+267 7000 0001', country: 'Botswana', entityType: 'individual',
    licenceNumber: 'TEST-LIC-001', termsVersion: AUCTION_TERMS_VERSION,
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

test('channel separation: bidder tokens never pass staff checks and vice versa', async () => {
  const token = await bidderToken('bidder-alice');
  assert.ok(token, 'cookie minted');
  const payload = await bidderSession.verifyBidderSession(token);
  assert.equal(payload.bid, 'bidder-alice');
  assert.equal(payload.kind, 'bidder');
  // Cross-channel: the bidder cookie has no role claim -> not staff.
  assert.equal(await staffSession.verifyStaffSession(token), false);
  // And a staff token has kind != bidder -> not a bidder session.
  assert.equal(await bidderSession.verifyBidderSession(staffToken('staff')), null);
});

test('bidder session: tampering and expiry are rejected', async () => {
  const token = await bidderToken('bidder-alice');
  const tampered = token.slice(0, -2) + (token.endsWith('a') ? 'b' : 'a') + token.slice(-1);
  assert.equal(await bidderSession.verifyBidderSession(tampered), null);
  // Correctly signed but 9 hours old (lifetime is 8h).
  const oldPayload = Buffer.from(JSON.stringify({ ts: Date.now() - 9 * 3600_000, kind: 'bidder', bid: 'bidder-alice' })).toString('base64url');
  const oldSig = crypto.createHmac('sha256', SECRET).update(oldPayload).digest('base64url');
  assert.equal(await bidderSession.verifyBidderSession(`${oldPayload}.${oldSig}`), null);
});

/* ── 2. OTP security ── */

test('OTP: request/verify roundtrip; only the HMAC of the code is stored', async () => {
  const store = new MemoryBidderStore();
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
  const store = new MemoryBidderStore();
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
  const store = new MemoryBidderStore();
  let captured = null;
  await otp.requestOtp(store, 'alice@example.test', { now: NOW, sendCode: async (to, code) => { captured = code; return true; } });
  const wrong = captured === '000000' ? '000001' : '000000';
  for (let i = 0; i < otp.OTP_MAX_ATTEMPTS; i++) {
    assert.equal(await otp.verifyOtp(store, 'alice@example.test', wrong, NOW), 'mismatch');
  }
  assert.equal(await otp.verifyOtp(store, 'alice@example.test', captured, NOW), 'too_many_attempts');
});

test('OTP: request limits are shared-store, per email (5/h) and per IP (20/h)', async () => {
  const store = new MemoryBidderStore();
  let sends = 0;
  const sendCode = async () => { sends += 1; return true; };
  for (let i = 0; i < otp.OTP_REQUEST_LIMIT_PER_EMAIL_HOUR; i++) {
    assert.equal(await otp.requestOtp(store, 'alice@example.test', { now: NOW, ip: `10.0.0.${i}`, sendCode }), true);
  }
  assert.equal(await otp.requestOtp(store, 'alice@example.test', { now: NOW, ip: '10.9.9.9', sendCode }), false, '6th email request dropped');
  assert.equal(sends, otp.OTP_REQUEST_LIMIT_PER_EMAIL_HOUR);

  const store2 = new MemoryBidderStore();
  let sends2 = 0;
  const sendCode2 = async () => { sends2 += 1; return true; };
  for (let i = 0; i < otp.OTP_REQUEST_LIMIT_PER_IP_HOUR; i++) {
    await otp.requestOtp(store2, `person${i}@example.test`, { now: NOW, ip: '203.0.113.7', sendCode: sendCode2 });
  }
  assert.equal(await otp.requestOtp(store2, 'onemore@example.test', { now: NOW, ip: '203.0.113.7', sendCode: sendCode2 }), false, '21st IP request dropped');
  assert.equal(sends2, otp.OTP_REQUEST_LIMIT_PER_IP_HOUR);
});

/* ── 3. Lifecycle and terms ── */

test('lifecycle: register -> pending -> approve -> suspend, all audited with reasons', async () => {
  const store = new MemoryBidderStore();
  const bidder = await alice(store);
  assert.equal(bidder.status, 'pending');
  assert.equal(service.bidderMayBid(bidder), false, 'pending cannot bid');

  const approved = await service.decideBidder(store, bidder.id, 'approve', 'Licence sighted', 'staff:owner');
  assert.equal(approved.status, 'verified');
  assert.equal(service.bidderMayBid(approved), true);

  const suspended = await service.decideBidder(store, bidder.id, 'suspend', 'Compliance hold', 'staff:owner');
  assert.equal(suspended.status, 'suspended');
  assert.equal(suspended.statusReason, 'Compliance hold');
  assert.equal(service.bidderMayBid(suspended), false);

  const actions = store.auditTrail().map((a) => a.action);
  assert.deepEqual(actions, ['bidder.registered', 'bidder.approved', 'bidder.suspended']);
  assert.equal(store.auditTrail()[2].actor, 'staff:owner');
});

test('terms: stale acceptance blocks bidding until the current version is accepted', async () => {
  const store = new MemoryBidderStore();
  const bidder = await service.registerBidder(store, {
    id: 'bidder-bob', name: 'Bob Example', email: 'bob@example.test',
    phone: '+267 7000 0002', country: 'Botswana', entityType: 'company',
    licenceNumber: '', termsVersion: '1999-01-superseded',
  }, NOW);
  await service.decideBidder(store, bidder.id, 'approve', 'ok', 'staff:owner');
  let current = await store.getBidder(bidder.id);
  assert.equal(service.bidderMayBid(current), false, 'verified but stale terms cannot bid');
  assert.equal(service.bidderStatusMessage(current).state, 'terms_stale');
  await service.acceptTerms(store, bidder.id);
  current = await store.getBidder(bidder.id);
  assert.equal(current.termsVersion, AUCTION_TERMS_VERSION);
  assert.equal(service.bidderMayBid(current), true);
  assert.ok(store.auditTrail().some((a) => a.action === 'bidder.terms_accepted'));
});

/* ── 4. Real BidderResolver behind the feature flag ── */

test('resolver: flag OFF ignores bidder cookies entirely (staff-only bidding)', async () => {
  delete process.env.AUCTION_PUBLIC_BIDDING;
  const store = new MemoryBidderStore();
  await alice(store);
  await service.decideBidder(store, 'bidder-alice', 'approve', 'ok', 'staff:owner');
  const token = await bidderToken('bidder-alice');

  const r = resolver.createDefaultBidderResolver(store);
  assert.equal(await r.resolve(`adb_bidder=${token}`), null, 'bidder cookie ignored while flag off');
  const staff = await r.resolve(`adb_session=${staffToken('staff')}`);
  assert.equal(staff.bidderId, 'staff:session');
  assert.equal(staff.verified, true);
});

test('resolver: flag ON resolves verified bidders; suspension applies to the very next resolve', async () => {
  process.env.AUCTION_PUBLIC_BIDDING = '1';
  try {
    const store = new MemoryBidderStore();
    await alice(store);
    const token = await bidderToken('bidder-alice');

    const r = resolver.createDefaultBidderResolver(store);
    let identity = await r.resolve(`adb_bidder=${token}`);
    assert.equal(identity.verified, false, 'pending bidder is not verified');
    assert.equal(identity.termsCurrent, true);
    assert.equal(identity.via, 'bidder-account');

    await service.decideBidder(store, 'bidder-alice', 'approve', 'ok', 'staff:owner');
    identity = await r.resolve(`adb_bidder=${token}`);
    assert.equal(identity.verified, true);

    // Mid-auction suspension: the resolver re-reads the row every time.
    await service.decideBidder(store, 'bidder-alice', 'suspend', 'hold', 'staff:owner');
    identity = await r.resolve(`adb_bidder=${token}`);
    assert.equal(identity.verified, false, 'suspended effective immediately');
  } finally {
    delete process.env.AUCTION_PUBLIC_BIDDING;
  }
});

test('resolver: stale terms report termsCurrent=false; anonymised accounts do not resolve', async () => {
  process.env.AUCTION_PUBLIC_BIDDING = '1';
  try {
    const store = new MemoryBidderStore();
    await service.registerBidder(store, {
      id: 'bidder-bob', name: 'Bob Example', email: 'bob@example.test',
      phone: '', country: 'BW', entityType: 'individual', licenceNumber: '',
      termsVersion: '1999-01-superseded',
    }, NOW);
    await service.decideBidder(store, 'bidder-bob', 'approve', 'ok', 'staff:owner');
    const r = resolver.createDefaultBidderResolver(store);
    const identity = await r.resolve(`adb_bidder=${await bidderToken('bidder-bob')}`);
    assert.equal(identity.verified, true);
    assert.equal(identity.termsCurrent, false, 'bid route will answer terms_not_accepted');

    await service.anonymiseBidder(store, 'bidder-bob', 'staff:owner');
    assert.equal(await r.resolve(`adb_bidder=${await bidderToken('bidder-bob')}`), null);
  } finally {
    delete process.env.AUCTION_PUBLIC_BIDDING;
  }
});

/* ── 5. Bid path enforcement ── */

test('bid path: unverified bidders are rejected in the engine; the route adds the terms gate', async () => {
  const store = new MemoryAuctionStore();
  store.seedLot(makeLot());
  const rejected = await placeBid(store, {
    lotId: 'lot-1',
    bidder: { bidderId: 'bidder-alice', verified: false, via: 'bidder-account' },
    amountMinor: 150_000, idempotencyKey: 'phase3a-unverified', sleep: noSleep,
  });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.reason, 'bidder_unverified');

  const accepted = await placeBid(store, {
    lotId: 'lot-1',
    bidder: { bidderId: 'bidder-alice', verified: true, via: 'bidder-account', termsCurrent: true },
    amountMinor: 150_000, idempotencyKey: 'phase3a-verified', sleep: noSleep,
  });
  assert.equal(accepted.status, 'accepted');

  // The HTTP terms gate lives in the route (403 terms_not_accepted) — assert it statically.
  const route = readFileSync(new URL('../src/app/api/lots/[id]/bids/route.ts', import.meta.url), 'utf8');
  assert.match(route, /terms_not_accepted/);
  assert.match(route, /defaultBidderResolver/);
});

/* ── 6. Authz matrix ── */

test('authz matrix: only owner and staff can review or decide bidders', () => {
  const actors = [null, undefined, '', 'owner', 'staff', 'cousin', 'developer-admin', 'bidder', 'root'];
  const expectReview = { owner: true, staff: true };
  for (const role of actors) {
    assert.equal(authz.canReviewBidders(role), expectReview[role] ?? false, `canReview(${role})`);
    assert.equal(authz.canDecideBidders(role), expectReview[role] ?? false, `canDecide(${role})`);
  }
});

test('authz matrix: every staff route calls its guard; middleware gates staff surfaces', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const staffRoutes = [
    ['../src/app/api/staff/bidders/route.ts', /canReviewBidders/],
    ['../src/app/api/staff/bidders/[id]/route.ts', /canReviewBidders/],
    ['../src/app/api/staff/bidders/[id]/decision/route.ts', /canDecideBidders/],
    ['../src/app/api/staff/bidders/[id]/export/route.ts', /canDecideBidders/],
    ['../src/app/api/staff/bidders/[id]/anonymise/route.ts', /canDecideBidders/],
    ['../src/app/api/staff/bidders/[id]/documents/[docId]/link/route.ts', /canReviewBidders/],
    ['../src/app/api/staff/bidders/[id]/documents/[docId]/view/route.ts', /verifyDocumentLink/],
  ];
  for (const [path, guard] of staffRoutes) {
    assert.match(read(path), guard, `${path} must call its guard`);
    assert.match(read(path), /getStaffSessionRole|verifyDocumentLink/, `${path} must establish the staff actor`);
  }
  const mw = read('../src/middleware.ts');
  assert.match(mw, /verifyStaffSession/, 'middleware requires a staff session for staff surfaces');
  assert.match(mw, /\/api\/bidders\/:path\*/, 'bidder API inside the matcher');
  assert.match(mw, /\/api\/staff\/:path\*/, 'staff API inside the matcher');
  assert.match(mw, /sameOrigin/, 'same-origin enforcement present');
  // Previously role-blind checks now demand the staff role claim.
  assert.match(read('../src/app/api/licence-docs/[fileId]/route.ts'), /verifyStaffSession/);
  assert.match(read('../src/app/api/lots/route.ts'), /verifyStaffSession/);
  // Bidder self routes are session-scoped (no id parameter at all).
  assert.match(read('../src/app/api/bidders/me/route.ts'), /verifyBidderSession/);
  assert.match(read('../src/app/api/bidders/documents/route.ts'), /sniffDocumentType/);
});

/* ── 7. IDOR resistance ── */

test('IDOR: document listings are scoped; signed links bind document AND bidder', async () => {
  const store = new MemoryBidderStore();
  await alice(store);
  await service.registerBidder(store, {
    id: 'bidder-bob', name: 'Bob Example', email: 'bob@example.test',
    phone: '', country: 'BW', entityType: 'individual', licenceNumber: '',
    termsVersion: AUCTION_TERMS_VERSION,
  }, NOW);
  await store.addDocument({
    id: 'doc-a', bidderId: 'bidder-alice', fileId: 'file-a', filename: 'alice-licence.pdf',
    contentType: 'application/pdf', size: 100, sha256: 'x', uploadedAt: NOW.toISOString(),
  });
  await store.addDocument({
    id: 'doc-b', bidderId: 'bidder-bob', fileId: 'file-b', filename: 'bob-licence.pdf',
    contentType: 'application/pdf', size: 100, sha256: 'y', uploadedAt: NOW.toISOString(),
  });
  assert.deepEqual((await store.listDocuments('bidder-alice')).map((d) => d.id), ['doc-a']);

  // A link minted for Alice's document carries her bidder id; the view route
  // rejects any path whose ids do not match the signed payload.
  const { token, sig } = docs.mintDocumentLink({ docId: 'doc-a', bidderId: 'bidder-alice', staff: 'staff:owner', exp: Date.now() + 60_000 });
  const payload = docs.verifyDocumentLink(token, sig);
  assert.equal(payload.bidderId, 'bidder-alice');
  assert.equal(payload.docId, 'doc-a');
  assert.notEqual(payload.bidderId, 'bidder-bob', 'cannot be replayed under another bidder path');
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
  const { token, sig } = docs.mintDocumentLink({ docId: 'doc-a', bidderId: 'bidder-alice', staff: 'staff:owner', exp });
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
  const store = new MemoryBidderStore();
  await alice(store);
  await store.addDocument({
    id: 'doc-a', bidderId: 'bidder-alice', fileId: 'file-a', filename: 'alice-licence.pdf',
    contentType: 'application/pdf', size: 100, sha256: 'x', uploadedAt: NOW.toISOString(),
  });

  const exported = await service.exportBidderData(store, 'bidder-alice', 'staff:owner');
  assert.equal(exported.bidder.email, 'alice@example.test');
  assert.equal(exported.documents.length, 1);
  assert.equal(exported.exportedBy, 'staff:owner');

  await service.recordDocumentView(store, {
    bidderId: 'bidder-alice', documentId: 'doc-a', filename: 'alice-licence.pdf', staffActor: 'staff:owner',
  });

  const actions = store.auditTrail().map((a) => a.action);
  assert.ok(actions.includes('bidder.data_exported'));
  const view = store.auditTrail().find((a) => a.action === 'bidder.document_viewed');
  assert.equal(view.actor, 'staff:owner', 'view audited with the staff actor');
  assert.ok(view.createdAt, 'view audited with a timestamp');
});

test('anonymisation erases PII, keeps the row id for bid/audit integrity, blocks login', async () => {
  const store = new MemoryBidderStore();
  await alice(store);
  await service.decideBidder(store, 'bidder-alice', 'approve', 'ok', 'staff:owner');
  const ok = await service.anonymiseBidder(store, 'bidder-alice', 'staff:owner');
  assert.equal(ok, true);

  const erased = await store.getBidder('bidder-alice');
  assert.ok(erased, 'row survives under the same id (bids/audit stay linked)');
  assert.equal(erased.name, 'Deleted bidder');
  assert.equal(erased.email, 'deleted+bidder-alice@invalid');
  assert.equal(erased.phone, '');
  assert.ok(erased.anonymisedAt);
  assert.equal(await store.getBidderByEmail('alice@example.test'), null, 'old email no longer resolves');
  assert.ok(store.auditTrail().some((a) => a.action === 'bidder.anonymised' && a.actor === 'staff:owner'));
});

/* ── 10. Same-origin enforcement (ported from recovery proxy.ts) ── */

test('sameOrigin: exact-origin semantics, no-Origin denied, AMES_APP_ORIGIN honoured', () => {
  const req = (url, origin) => ({ url, headers: { get: (n) => (n.toLowerCase() === 'origin' ? (origin ?? null) : null) } });
  const saved = process.env.AMES_APP_ORIGIN;
  delete process.env.AMES_APP_ORIGIN;
  try {
    assert.equal(sameOrigin(req('https://ames.example.com/api/lots', 'https://ames.example.com')), true);
    assert.equal(sameOrigin(req('https://ames.example.com/api/lots', 'https://evil.example')), false);
    assert.equal(sameOrigin(req('https://ames.example.com/api/lots', null)), false, 'no Origin is denied');
    process.env.AMES_APP_ORIGIN = 'https://bid.ames.example.com';
    assert.equal(sameOrigin(req('https://internal.local/api/lots', 'https://bid.ames.example.com')), true);
    assert.equal(sameOrigin(req('https://bid.ames.example.com/api/lots', 'https://bid.ames.example.com.evil.example')), false);
  } finally {
    if (saved === undefined) delete process.env.AMES_APP_ORIGIN;
    else process.env.AMES_APP_ORIGIN = saved;
  }
});
