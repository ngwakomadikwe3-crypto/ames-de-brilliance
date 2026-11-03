/**
 * Lots suite (node:test, Node >= 22 strip-types) — STEP d1.
 *
 * Covers: lot number/currency/minor-unit validation (amendment 5), the state
 * machine with the owner-only publish matrix (amendment 1), the seller
 * licence expiry gate at publish (amendment 2, inclusive Africa/Gaborone
 * calendar dates), material-edit demotion to pending_review (amendment 6),
 * the single price-visibility predicate, catalogue payload shaping, GLB
 * magic-byte sniffing and size caps (amendment 8), signed model links and
 * upload tickets (domain-separated purposes, tamper + expiry), compliance
 * document links, and catalogue access gating behind
 * CATALOGUE_PUBLIC_ACCESS.
 *
 * All fixtures are invented — no real mines, licences or counterparties.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

// SESSION_SECRET must exist BEFORE the session modules are imported.
process.env.SESSION_SECRET = 'lot-test-secret-0123456789abcdef0123456789abcdef';
delete process.env.CATALOGUE_PUBLIC_ACCESS;
delete process.env.LOT_MODEL_ACCESS;
delete process.env.LOT_MODEL_MAX_BYTES;

const { MemoryLotStore } = await import('../src/lib/lots/memory-store.ts');
const { MemoryBuyerStore } = await import('../src/lib/buyers/memory-store.ts');
const service = await import('../src/lib/lots/service.ts');
const model = await import('../src/lib/lots/model.ts');
const compliance = await import('../src/lib/lots/compliance.ts');
const access = await import('../src/lib/buyers/access.ts');
const buyerService = await import('../src/lib/buyers/service.ts');
const { hmacSignFor } = await import('../src/lib/hmac-domain.ts');
const { DuplicateLotNoError, LotTransitionError } = await import('../src/lib/lots/types.ts');

const NOW = new Date('2026-11-03T12:00:00Z');
// todayInGaborone(NOW) === '2026-11-03' (UTC+2, so 12:00 UTC is 14:00 local).
const LICENCE_VALID = '2026-12-31';
const LICENCE_TODAY = '2026-11-03';
const LICENCE_EXPIRED = '2026-11-02';

function draftInput(overrides = {}) {
  return {
    id: 'lot1',
    lotNo: '2026-014',
    title: 'Test Valley Parcel — 4.82 ct',
    description: 'Mixed crystals from the test valley.',
    origin: 'Test Valley',
    caratTotal: 4.82,
    stonesCount: 12,
    colour: 'D–F',
    clarity: 'VVS1–VS2',
    crystalForm: 'Octahedron',
    priceMinor: 1825000,
    currency: 'USD',
    sellerLicenceNumber: 'SL-TEST-001',
    sellerLicenceType: 'dealer',
    sellerLicenceExpiry: LICENCE_VALID,
    ...overrides,
  };
}

async function makeLot(store, overrides = {}) {
  return service.createLot(store, draftInput(overrides), 'staff:owner', NOW);
}

async function makePublishedLot(store, overrides = {}) {
  const lot = await makeLot(store, overrides);
  await store.updateLot(lot.id, { photoFileIds: ['p1'] });
  await service.transitionLot(store, lot.id, 'submit', 'staff', 'staff:staff', '', NOW);
  await service.transitionLot(store, lot.id, 'approve', 'owner', 'staff:owner', '', NOW);
  return service.transitionLot(store, lot.id, 'publish', 'owner', 'staff:owner', '', NOW);
}

/* ── Validation (amendment 5) ── */

test('currency: ISO 4217 alphabetic codes only', () => {
  assert.equal(service.isValidCurrency('USD'), true);
  assert.equal(service.isValidCurrency('BWP'), true);
  assert.equal(service.isValidCurrency('usd'), false);
  assert.equal(service.isValidCurrency('US'), false);
  assert.equal(service.isValidCurrency('USDD'), false);
  assert.equal(service.isValidCurrency(''), false);
});

test('minor units: safe non-negative integers only', () => {
  assert.equal(service.isValidMinorUnits(0), true);
  assert.equal(service.isValidMinorUnits(1825000), true);
  assert.equal(service.isValidMinorUnits(1.5), false);
  assert.equal(service.isValidMinorUnits(-100), false);
  assert.equal(service.isValidMinorUnits(Number.MAX_SAFE_INTEGER + 1), false);
});

/* ── Creation ── */

test('createLot makes a draft and rejects a duplicate lot number', async () => {
  const store = new MemoryLotStore();
  const lot = await makeLot(store);
  assert.equal(lot.state, 'draft');
  assert.equal(lot.createdBy, 'staff:owner');
  await assert.rejects(() => makeLot(store, { id: 'lot2' }), DuplicateLotNoError);
});

test('createLot rejects a malformed lot number and empty title', async () => {
  const store = new MemoryLotStore();
  await assert.rejects(() => makeLot(store, { lotNo: 'bad/no' }), LotTransitionError);
  await assert.rejects(() => makeLot(store, { lotNo: '2026-015', title: '  ' }), LotTransitionError);
});

/* ── Completeness gate ── */

test('lotReviewProblems names every missing piece; a complete lot has none', async () => {
  const store = new MemoryLotStore();
  const bare = await service.createLot(store, { id: 'bare1', lotNo: '2026-099', title: 'Bare' }, 'staff:staff', NOW);
  const problems = service.lotReviewProblems(bare);
  for (const field of ['origin', 'caratTotal', 'stonesCount', 'colour', 'clarity', 'crystalForm', 'priceMinor', 'currency', 'sellerLicenceNumber', 'sellerLicenceType', 'sellerLicenceExpiry', 'photos']) {
    assert.ok(problems.includes(field), `expected problem: ${field}`);
  }
  const full = await makeLot(store, { id: 'full1', lotNo: '2026-100' });
  full.photoFileIds = ['photo1'];
  assert.deepEqual(service.lotReviewProblems(full), []);
});

/* ── State machine (amendments 1 + 2) ── */

test('submit requires completeness; staff may submit', async () => {
  const store = new MemoryLotStore();
  const bare = await service.createLot(store, { id: 'b1', lotNo: '2026-101', title: 'Bare' }, 'staff:staff', NOW);
  await assert.rejects(
    () => service.transitionLot(store, bare.id, 'submit', 'staff', 'staff:staff', '', NOW),
    (e) => e instanceof LotTransitionError && e.code === 'incomplete',
  );
  const lot = await makeLot(store, { id: 's1', lotNo: '2026-102' });
  await store.updateLot(lot.id, { photoFileIds: ['p1'] });
  const submitted = await service.transitionLot(store, lot.id, 'submit', 'staff', 'staff:staff', '', NOW);
  assert.equal(submitted.state, 'pending_review');
});

test('approve/publish/withdraw are owner-only (amendment 1)', async () => {
  const store = new MemoryLotStore();
  const lot = await makeLot(store);
  await store.updateLot(lot.id, { photoFileIds: ['photo1'] });
  await service.transitionLot(store, lot.id, 'submit', 'staff', 'staff:staff', '', NOW);

  await assert.rejects(
    () => service.transitionLot(store, lot.id, 'approve', 'staff', 'staff:staff', '', NOW),
    (e) => e instanceof LotTransitionError && e.code === 'role_denied',
  );
  const approved = await service.transitionLot(store, lot.id, 'approve', 'owner', 'staff:owner', '', NOW);
  assert.equal(approved.state, 'approved');
  assert.equal(approved.approvedBy, 'staff:owner');

  await assert.rejects(
    () => service.transitionLot(store, lot.id, 'publish', 'staff', 'staff:staff', '', NOW),
    (e) => e instanceof LotTransitionError && e.code === 'role_denied',
  );
  const published = await service.transitionLot(store, lot.id, 'publish', 'owner', 'staff:owner', '', NOW);
  assert.equal(published.state, 'published');
  assert.equal(published.publishedBy, 'staff:owner');

  await assert.rejects(
    () => service.transitionLot(store, lot.id, 'withdraw', 'staff', 'staff:staff', 'reason here', NOW),
    (e) => e instanceof LotTransitionError && e.code === 'role_denied',
  );
});

test('publish refuses an expired seller licence; expiry is inclusive (amendment 2)', async () => {
  const store = new MemoryLotStore();
  // Expired yesterday — refused.
  const dead = await makeLot(store, { id: 'd1', lotNo: '2026-103', sellerLicenceExpiry: LICENCE_EXPIRED });
  await store.updateLot(dead.id, { photoFileIds: ['p1'] });
  await service.transitionLot(store, dead.id, 'submit', 'staff', 'staff:staff', '', NOW);
  await service.transitionLot(store, dead.id, 'approve', 'owner', 'staff:owner', '', NOW);
  await assert.rejects(
    () => service.transitionLot(store, dead.id, 'publish', 'owner', 'staff:owner', '', NOW),
    (e) => e instanceof LotTransitionError && e.code === 'seller_licence_expired',
  );
  // Expires TODAY — the final day still counts (inclusive, Africa/Gaborone).
  const lastDay = await makeLot(store, { id: 'd2', lotNo: '2026-104', sellerLicenceExpiry: LICENCE_TODAY });
  await store.updateLot(lastDay.id, { photoFileIds: ['p1'] });
  await service.transitionLot(store, lastDay.id, 'submit', 'staff', 'staff:staff', '', NOW);
  await service.transitionLot(store, lastDay.id, 'approve', 'owner', 'staff:owner', '', NOW);
  const ok = await service.transitionLot(store, lastDay.id, 'publish', 'owner', 'staff:owner', '', NOW);
  assert.equal(ok.state, 'published');
});

test('reject returns to draft and requires a reason; withdraw and reopen', async () => {
  const store = new MemoryLotStore();
  const lot = await makeLot(store);
  await store.updateLot(lot.id, { photoFileIds: ['p1'] });
  await service.transitionLot(store, lot.id, 'submit', 'staff', 'staff:staff', '', NOW);
  await assert.rejects(
    () => service.transitionLot(store, lot.id, 'reject', 'owner', 'staff:owner', '', NOW),
    (e) => e instanceof LotTransitionError && e.code === 'reason_required',
  );
  const rejected = await service.transitionLot(store, lot.id, 'reject', 'owner', 'staff:owner', 'photos too dark', NOW);
  assert.equal(rejected.state, 'draft');
  assert.equal(rejected.stateReason, 'photos too dark');

  const published = await makePublishedLot(store, { id: 'w1', lotNo: '2026-105' });
  const withdrawn = await service.transitionLot(store, published.id, 'withdraw', 'owner', 'staff:owner', 'seller recalled', NOW);
  assert.equal(withdrawn.state, 'withdrawn');
  const reopened = await service.transitionLot(store, published.id, 'reopen', 'staff', 'staff:staff', '', NOW);
  assert.equal(reopened.state, 'draft');
});

test('illegal transitions are refused', async () => {
  const store = new MemoryLotStore();
  const lot = await makeLot(store);
  await assert.rejects(
    () => service.transitionLot(store, lot.id, 'publish', 'owner', 'staff:owner', '', NOW),
    (e) => e instanceof LotTransitionError && e.code === 'illegal_transition',
  );
  await assert.rejects(
    () => service.transitionLot(store, 'nope', 'submit', 'staff', 'staff:staff', '', NOW),
    (e) => e instanceof LotTransitionError && e.code === 'not_found',
  );
});

/* ── Amendment 6: material edit demotion ── */

test('a material edit demotes approved/published lots to pending_review', async () => {
  const store = new MemoryLotStore();
  const published = await makePublishedLot(store);
  const demoted = await service.editLot(store, published.id, { priceMinor: 1990000 }, 'staff:staff', NOW);
  assert.equal(demoted.state, 'pending_review');
  assert.equal(demoted.priceMinor, 1990000);

  // Back through the machine, then an identical-value edit does NOT demote.
  await service.transitionLot(store, published.id, 'approve', 'owner', 'staff:owner', '', NOW);
  const republished = await service.transitionLot(store, published.id, 'publish', 'owner', 'staff:owner', '', NOW);
  const untouched = await service.editLot(store, republished.id, { title: republished.title }, 'staff:staff', NOW);
  assert.equal(untouched.state, 'published');
});

test('photo list changes are material and demote a published lot', async () => {
  const store = new MemoryLotStore();
  const published = await makePublishedLot(store, { id: 'ph1', lotNo: '2026-106' });
  const demoted = await service.editLot(store, published.id, { photoFileIds: ['p1', 'p2'] }, 'staff:staff', NOW);
  assert.equal(demoted.state, 'pending_review');
  assert.deepEqual(demoted.photoFileIds, ['p1', 'p2']);
});

test('sanitizeLotPatch coerces and rejects by type; unknown keys dropped', () => {
  const patch = service.sanitizeLotPatch({ title: '  New title  ', currency: 'usd', priceMinor: 100, evil: 'x' });
  assert.deepEqual(patch, { title: 'New title', currency: 'USD', priceMinor: 100 });
  assert.throws(() => service.sanitizeLotPatch({ priceMinor: '100' }), LotTransitionError);
  assert.throws(() => service.sanitizeLotPatch({ caratTotal: -1 }), LotTransitionError);
  assert.throws(() => service.sanitizeLotPatch({ stonesCount: 1.5 }), LotTransitionError);
  assert.throws(() => service.sanitizeLotPatch(null), LotTransitionError);
});

/* ── Price visibility (owner decision: staff + verified buyers only) ── */

test('maySeeLotPrice: staff and verified buyers yes; anonymous and unverified no', () => {
  assert.equal(service.maySeeLotPrice({ kind: 'staff' }), true);
  assert.equal(service.maySeeLotPrice({ kind: 'buyer', buyerId: 'b1', verified: true, termsCurrent: true, mayOffer: true }), true);
  assert.equal(service.maySeeLotPrice({ kind: 'buyer', buyerId: 'b1', verified: false, termsCurrent: false, mayOffer: false }), false);
  assert.equal(service.maySeeLotPrice({ kind: 'anonymous' }), false);
});

test('toCatalogueView strips the price for anonymous and keeps it for verified buyers', async () => {
  const store = new MemoryLotStore();
  const lot = await makePublishedLot(store);
  const anonymousView = service.toCatalogueView(lot, { kind: 'anonymous' });
  assert.equal(anonymousView.priceMinor, undefined);
  assert.equal(anonymousView.currency, undefined);
  const buyerView = service.toCatalogueView(lot, { kind: 'buyer', buyerId: 'b1', verified: true, termsCurrent: true, mayOffer: true });
  assert.equal(buyerView.priceMinor, 1825000);
  assert.equal(buyerView.currency, 'USD');
  assert.deepEqual(buyerView.photos, lot.photoFileIds.map((f) => `/api/lots/${lot.id}/photo/${f}`));
  assert.equal(buyerView.hasModel, false);
});

/* ── GLB sniffing and size caps (amendment 8) ── */

function glbBytes(totalLength = 1024) {
  const bytes = new Uint8Array(totalLength);
  bytes.set([0x67, 0x6c, 0x54, 0x46], 0); // "glTF"
  new DataView(bytes.buffer).setUint32(4, 2, true);
  new DataView(bytes.buffer).setUint32(8, totalLength, true);
  return bytes;
}

test('isGlb accepts a real glTF binary header and rejects everything else', () => {
  assert.equal(model.isGlb(glbBytes()), true);
  assert.equal(model.isGlb(glbBytes(2048)), true);
  const badMagic = glbBytes();
  badMagic[0] = 0x00;
  assert.equal(model.isGlb(badMagic), false);
  const v1 = glbBytes();
  new DataView(v1.buffer).setUint32(4, 1, true);
  assert.equal(model.isGlb(v1), false);
  assert.equal(model.isGlb(new Uint8Array(8)), false);
  const lying = glbBytes(1024);
  new DataView(lying.buffer).setUint32(8, 999999, true);
  assert.equal(model.isGlb(lying), false);
});

test('lotModelMaxBytes: default 50 MB, env override, 100 MB ceiling', () => {
  assert.equal(model.lotModelMaxBytes({}), model.LOT_MODEL_DEFAULT_MAX_BYTES);
  assert.equal(model.lotModelMaxBytes({ LOT_MODEL_MAX_BYTES: '1048576' }), 1048576);
  assert.equal(model.lotModelMaxBytes({ LOT_MODEL_MAX_BYTES: '999999999' }), model.LOT_MODEL_BUCKET_CEILING_BYTES);
  assert.equal(model.lotModelMaxBytes({ LOT_MODEL_MAX_BYTES: 'junk' }), model.LOT_MODEL_DEFAULT_MAX_BYTES);
});

test('lotModelAccess: verified by default; browsers only on the exact opt-in', () => {
  assert.equal(model.lotModelAccess({}), 'verified');
  assert.equal(model.lotModelAccess({ LOT_MODEL_ACCESS: 'browsers' }), 'browsers');
  assert.equal(model.lotModelAccess({ LOT_MODEL_ACCESS: 'yes' }), 'verified');
});

/* ── Signed links and tickets ── */

test('model links roundtrip; tamper, wrong purpose and expiry fail', () => {
  const payload = { lotId: 'lot1', fileId: 'file1', viewer: 'buyer:b1', exp: Date.now() + 60000 };
  const link = model.mintModelLink(payload);
  assert.ok(link);
  assert.deepEqual(model.verifyModelLink(link.token, link.sig), payload);
  assert.equal(model.verifyModelLink(link.token, `${link.sig.slice(0, -2)}xx`), null);
  // A signature from another domain-separated purpose never verifies here.
  const foreign = hmacSignFor('report-share', link.token);
  assert.equal(model.verifyModelLink(link.token, foreign), null);
  const expired = model.mintModelLink({ ...payload, exp: Date.now() - 1000 });
  assert.equal(model.verifyModelLink(expired.token, expired.sig), null);
});

test('upload tickets roundtrip; tamper and expiry fail', () => {
  const ticket = model.mintUploadTicket({ lotId: 'lot1', staff: 'staff:owner', exp: Date.now() + 60000 });
  assert.ok(ticket);
  const payload = model.verifyUploadTicket(ticket.token, ticket.sig);
  assert.equal(payload.lotId, 'lot1');
  assert.equal(payload.staff, 'staff:owner');
  assert.equal(model.verifyUploadTicket(ticket.token, `${ticket.sig.slice(0, -2)}xx`), null);
  const expired = model.mintUploadTicket({ lotId: 'lot1', staff: 'staff:owner', exp: Date.now() - 1000 });
  assert.equal(model.verifyUploadTicket(expired.token, expired.sig), null);
  // Model-view tokens and upload tickets are different purposes.
  const foreign = hmacSignFor('lot-model-link', ticket.token);
  assert.equal(model.verifyUploadTicket(ticket.token, foreign), null);
});

test('compliance links roundtrip; tamper and expiry fail', () => {
  const link = compliance.mintComplianceLink({ lotId: 'lot1', docId: 'doc1', staff: 'staff:owner', exp: Date.now() + 60000 });
  assert.ok(link);
  const payload = compliance.verifyComplianceLink(link.token, link.sig);
  assert.equal(payload.docId, 'doc1');
  assert.equal(compliance.verifyComplianceLink(link.token, `${link.sig.slice(0, -2)}xx`), null);
  const foreign = hmacSignFor('buyer-doc-link', link.token);
  assert.equal(compliance.verifyComplianceLink(link.token, foreign), null);
});

/* ── Catalogue access gating (integration with the buyer store) ── */

async function verifiedBuyer(store) {
  const buyer = await buyerService.registerBuyer(store, {
    id: 'b1',
    name: 'Test Buyer',
    email: 'buyer@example.test',
    phone: '',
    country: 'BW',
    entityType: 'company',
    licenceNumber: 'BL-TEST-001',
    licenceType: 'dealer',
    licenceExpiry: '2027-01-31',
    termsVersion: (await import('../src/lib/buyers/terms.ts')).BUYER_TERMS_VERSION,
  }, NOW);
  await buyerService.decideBuyer(store, buyer.id, 'approve', 'sighted licence', 'staff:owner', NOW);
  return buyer;
}

test('catalogue access: anonymous gated by the flag; verified buyers browse and may offer', async () => {
  const buyerStore = new MemoryBuyerStore();
  const buyer = await verifiedBuyer(buyerStore);
  const { createBuyerSessionCookie, buyerTokenFromCookieHeader } = await import('../src/lib/buyers/session.ts');
  const cookie = await createBuyerSessionCookie(buyer.id, false);
  const header = `adb_buyer=${buyerTokenFromCookieHeader(cookie)}`;

  const anon = await access.resolveCatalogueAccess(null, buyerStore, NOW);
  assert.equal(anon.canBrowse, false);
  assert.equal(anon.canOffer, false);

  process.env.CATALOGUE_PUBLIC_ACCESS = '1';
  const anonOpen = await access.resolveCatalogueAccess(null, buyerStore, NOW);
  assert.equal(anonOpen.canBrowse, true);
  assert.equal(anonOpen.canOffer, false);
  delete process.env.CATALOGUE_PUBLIC_ACCESS;

  const resolved = await access.resolveCatalogueAccess(header, buyerStore, NOW);
  assert.equal(resolved.canBrowse, true);
  assert.equal(resolved.canOffer, true);
  assert.equal(service.maySeeLotPrice(resolved.access), true);

  // Suspension takes effect on the very next resolve (fresh row read).
  await buyerService.decideBuyer(buyerStore, buyer.id, 'suspend', 'audit hold', 'staff:owner', NOW);
  const suspended = await access.resolveCatalogueAccess(header, buyerStore, NOW);
  assert.equal(suspended.canBrowse, false);
  assert.equal(suspended.canOffer, false);
});

/* ── Memory store roundtrip ── */

test('memory store: create, patch, published filter, compliance docs, audit', async () => {
  const store = new MemoryLotStore();
  const lot = await makeLot(store);
  assert.equal((await store.getLot(lot.id)).lotNo, '2026-014');
  assert.equal((await store.getLotByNo('2026-014')).id, lot.id);
  assert.equal((await store.listPublishedLots()).length, 0);

  await store.updateLot(lot.id, { state: 'published', publishedAt: NOW.toISOString() });
  assert.equal((await store.listPublishedLots()).length, 1);

  await store.addComplianceDoc({
    id: 'doc1', lotId: lot.id, docType: 'kp_certificate', fileId: 'f1',
    filename: 'kp.pdf', contentType: 'application/pdf', size: 10, sha256: 'abc',
    notes: '', uploadedBy: 'staff:owner', uploadedAt: NOW.toISOString(),
  });
  assert.equal((await store.listComplianceDocs(lot.id)).length, 1);
  await store.deleteComplianceDoc('doc1');
  assert.equal((await store.listComplianceDocs(lot.id)).length, 0);

  assert.ok(store.auditTrail().some((e) => e.action === 'lot.created'));
});
