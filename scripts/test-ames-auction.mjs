/**
 * Auction engine unit + concurrency tests (node:test, Node >= 22 strip-types).
 * Runs entirely against MemoryAuctionStore, which emulates the Appwrite
 * Transactions API conflict semantics. The real-Appwrite race test lives in
 * scripts/auction-concurrency-staging.mjs (needs staging credentials; not CI).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LOT_STATUSES } from '../src/lib/auction/types.ts';
import {
  InvalidTransitionError,
  LOT_TRANSITIONS,
  assertTransition,
  canTransition,
} from '../src/lib/auction/state-machine.ts';
import {
  applyTransitions,
  decideBid,
  minimumBidMinor,
  timedTransitions,
} from '../src/lib/auction/engine.ts';
import { MemoryAuctionStore } from '../src/lib/auction/memory-store.ts';
import { bidRowId, listLotsResolved, placeBid, resolveLotNow } from '../src/lib/auction/place-bid.ts';

const noSleep = () => Promise.resolve();
// Tiny real backoff for the storm test: mirrors network spread so optimistic
// retries don't collide deterministically at the same commit point.
const tinySleep = (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5)));
const VERIFIED = { bidderId: 'bidder:ana', verified: true, via: 'test' };
const UNVERIFIED = { bidderId: 'bidder:bob', verified: false, via: 'test' };

function makeLot(overrides = {}) {
  const now = Date.now();
  return {
    id: 'lot-1',
    auctionId: 'auction-1',
    title: 'Test lot',
    description: '',
    stoneRef: 'AM-001',
    currency: 'BWP',
    status: 'live',
    startingBidMinor: 100_000,
    reserveMinor: 0,
    minIncrementMinor: 10_000,
    antiSnipeSeconds: 120,
    opensAt: new Date(now - 3_600_000).toISOString(),
    closesAt: new Date(now + 3_600_000).toISOString(),
    currentBidMinor: 0,
    currentBidderId: '',
    bidCount: 0,
    createdAt: new Date(now - 3_600_000).toISOString(),
    ...overrides,
  };
}

/* ── 1. State machine ── */

test('state machine: every allowed transition passes, every other pair throws', () => {
  for (const from of LOT_STATUSES) {
    for (const to of LOT_STATUSES) {
      if (LOT_TRANSITIONS[from].includes(to)) {
        assert.doesNotThrow(() => assertTransition(from, to), `${from} -> ${to} should be allowed`);
        assert.ok(canTransition(from, to));
      } else {
        assert.throws(() => assertTransition(from, to), InvalidTransitionError, `${from} -> ${to} must throw`);
        assert.equal(canTransition(from, to), false);
      }
    }
  }
  // Terminal states go nowhere.
  for (const terminal of ['sold', 'unsold', 'withdrawn']) {
    assert.deepEqual(LOT_TRANSITIONS[terminal], []);
  }
});

/* ── 2. Time-driven transitions (lazy close inputs) ── */

test('timedTransitions: scheduled -> live at opensAt, live -> closing -> sold|unsold at closesAt', () => {
  const t0 = Date.now();
  const lot = makeLot({ status: 'scheduled' });
  // Before opening: nothing.
  assert.deepEqual(timedTransitions(lot, new Date(t0 - 10 * 3_600_000)), []);
  // After opensAt, before closesAt: opens.
  assert.deepEqual(timedTransitions(lot, new Date(t0)), ['live']);
  // Past closesAt with no bids: full sweep to unsold.
  const past = new Date(t0 + 2 * 3_600_000);
  assert.deepEqual(timedTransitions(lot, past), ['live', 'closing', 'unsold']);
  // Past closesAt with a winning bid at/above reserve: sold.
  const withBid = makeLot({ status: 'live', bidCount: 1, currentBidMinor: 500_000, reserveMinor: 400_000 });
  assert.deepEqual(timedTransitions(withBid, past), ['closing', 'sold']);
  // Below reserve: unsold.
  const belowReserve = makeLot({ status: 'live', bidCount: 1, currentBidMinor: 300_000, reserveMinor: 400_000 });
  assert.deepEqual(timedTransitions(belowReserve, past), ['closing', 'unsold']);
  // Reserve 0 = no reserve: any bid sells.
  const noReserve = makeLot({ status: 'live', bidCount: 1, currentBidMinor: 100_000, reserveMinor: 0 });
  assert.deepEqual(timedTransitions(noReserve, past), ['closing', 'sold']);
});

test('applyTransitions moves status to the final element', () => {
  const lot = makeLot({ status: 'scheduled' });
  assert.equal(applyTransitions(lot, ['live']).status, 'live');
  assert.equal(applyTransitions(lot, []).status, 'scheduled');
});

/* ── 3. Increment and minimum rules ── */

test('minimumBidMinor: first bid meets starting bid; later bids add the increment', () => {
  const fresh = makeLot();
  assert.equal(minimumBidMinor(fresh), 100_000);
  const withBid = makeLot({ bidCount: 1, currentBidMinor: 250_000 });
  assert.equal(minimumBidMinor(withBid), 260_000);
});

test('decideBid: increment and validity rules', () => {
  const now = new Date();
  const lot = makeLot();
  // First bid below starting bid.
  assert.deepEqual(decideBid(lot, VERIFIED, 99_999, now), { ok: false, reason: 'amount_below_minimum', minimumMinor: 100_000 });
  // First bid at starting bid.
  const first = decideBid(lot, VERIFIED, 100_000, now);
  assert.equal(first.ok, true);
  // Second bid must clear high + increment.
  const high = { ...lot, bidCount: 1, currentBidMinor: 100_000, currentBidderId: 'bidder:ana' };
  assert.deepEqual(decideBid(high, VERIFIED, 109_999, now).reason, 'amount_below_minimum');
  assert.equal(decideBid(high, VERIFIED, 110_000, now).ok, true);
  // Equal to current high is never enough.
  assert.equal(decideBid(high, VERIFIED, 100_000, now).ok, false);
  // Non-integer amounts rejected.
  assert.equal(decideBid(lot, VERIFIED, 100_000.5, now).ok, false);
  // Unverified bidders rejected.
  assert.deepEqual(decideBid(lot, UNVERIFIED, 200_000, now), { ok: false, reason: 'bidder_unverified' });
  // Non-live lots reject with the right reason.
  assert.deepEqual(decideBid(makeLot({ status: 'draft' }), VERIFIED, 200_000, now), { ok: false, reason: 'lot_not_live' });
  assert.deepEqual(decideBid(makeLot({ status: 'sold' }), VERIFIED, 200_000, now), { ok: false, reason: 'lot_closed' });
});

/* ── 4. Anti-snipe ── */

test('anti-snipe: a bid inside the window extends closesAt; outside it does not', () => {
  const closes = Date.now() + 60_000; // 60s left, window 120s
  const lot = makeLot({ closesAt: new Date(closes).toISOString(), antiSnipeSeconds: 120 });
  const now = new Date(closes - 30_000);
  const decision = decideBid(lot, VERIFIED, 100_000, now);
  assert.equal(decision.ok, true);
  assert.equal(decision.extended, true);
  assert.equal(Date.parse(decision.patch.closesAt), now.getTime() + 120_000);

  const far = decideBid(makeLot({ closesAt: new Date(Date.now() + 600_000).toISOString() }), VERIFIED, 100_000, new Date());
  assert.equal(far.extended, false);

  const disabled = decideBid(makeLot({ antiSnipeSeconds: 0, closesAt: new Date(Date.now() + 5_000).toISOString() }), VERIFIED, 100_000, new Date());
  assert.equal(disabled.extended, false);
});

/* ── 5. placeBid happy path + audit ── */

test('placeBid: accepted bid updates the lot and writes audit entries', async () => {
  const store = new MemoryAuctionStore();
  store.seedLot(makeLot());
  const result = await placeBid(store, { lotId: 'lot-1', bidder: VERIFIED, amountMinor: 150_000, idempotencyKey: 'key-accept-1', sleep: noSleep });
  assert.equal(result.status, 'accepted');
  assert.equal(result.replayed, false);
  const lot = await store.getLot('lot-1');
  assert.equal(lot.currentBidMinor, 150_000);
  assert.equal(lot.currentBidderId, 'bidder:ana');
  assert.equal(lot.bidCount, 1);
  const actions = store.auditTrail().map((a) => a.action);
  assert.ok(actions.includes('bid.accepted'));
});

/* ── 6. Idempotent replay ── */

test('idempotency: replaying the same key returns the original bid and never double-counts', async () => {
  const store = new MemoryAuctionStore();
  store.seedLot(makeLot());
  const input = { lotId: 'lot-1', bidder: VERIFIED, amountMinor: 150_000, idempotencyKey: 'key-replay-1', sleep: noSleep };
  const first = await placeBid(store, input);
  assert.equal(first.status, 'accepted');
  // Sequential replay.
  const again = await placeBid(store, input);
  assert.equal(again.status, 'accepted');
  assert.equal(again.replayed, true);
  assert.equal(again.bid.id, bidRowId('key-replay-1'));
  const lot = await store.getLot('lot-1');
  assert.equal(lot.bidCount, 1);
  assert.equal((await store.listBidsForLot('lot-1')).length, 1);
  // Concurrent replay: same key fired in parallel.
  const store2 = new MemoryAuctionStore();
  store2.seedLot(makeLot());
  const input2 = { lotId: 'lot-1', bidder: VERIFIED, amountMinor: 200_000, idempotencyKey: 'key-replay-2', sleep: noSleep };
  const pair = await Promise.all([placeBid(store2, input2), placeBid(store2, input2)]);
  assert.equal(pair.filter((r) => r.status === 'accepted').length, 2);
  assert.ok(pair.some((r) => r.replayed), 'one of the twins observes the other as a replay');
  assert.equal((await store2.getLot('lot-1')).bidCount, 1);
  assert.equal((await store2.listBidsForLot('lot-1')).length, 1);
});

/* ── 7. Concurrency storm ── */

test('concurrency: 50 simultaneous bids — one winner, strictly increasing history, consistent lot', async () => {
  const store = new MemoryAuctionStore();
  store.seedLot(makeLot());
  const N = 50;
  const bids = Array.from({ length: N }, (_, i) => ({
    lotId: 'lot-1',
    bidder: { bidderId: `bidder:${i}`, verified: true, via: 'test' },
    // Deliberate ties: bidders repeat only 10 distinct price levels.
    amountMinor: 100_000 + (i % 10) * 10_000,
    idempotencyKey: `storm-${i}`,
    sleep: tinySleep,
    rateLimitPerMinute: 1000,
    maxAttempts: 30,
  }));
  const results = await Promise.all(bids.map((b) => placeBid(store, b)));

  const accepted = results.filter((r) => r.status === 'accepted');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.ok(accepted.length > 0, 'at least one bid lands');
  assert.ok(accepted.every((r) => !r.replayed), 'unique keys never replay');

  // Bid rows: one per accepted bid, amounts unique and each >= previous + increment
  // when ordered (commit order is visible in the audit trail).
  const rows = await store.listBidsForLot('lot-1');
  assert.equal(rows.length, accepted.length);
  const amounts = rows.map((r) => r.amountMinor);
  assert.equal(new Set(amounts).size, amounts.length, 'no two accepted bids at the same amount');
  for (let i = 1; i < amounts.length; i++) {
    assert.ok(amounts[i] >= amounts[i - 1] + 10_000, `history increases by the increment (${amounts[i - 1]} -> ${amounts[i]})`);
  }

  // Lot agrees with the winning bid.
  const lot = await store.getLot('lot-1');
  const top = rows[rows.length - 1];
  assert.equal(lot.currentBidMinor, top.amountMinor);
  assert.equal(lot.currentBidderId, top.bidderId);
  assert.equal(lot.bidCount, rows.length);

  // The high bid never went backwards across committed lot versions.
  let prev = 0;
  for (const version of store.committedLotVersions) {
    if (version.id !== 'lot-1' || version.bidCount === 0) continue;
    assert.ok(version.currentBidMinor >= prev, `high bid regressed ${prev} -> ${version.currentBidMinor}`);
    prev = version.currentBidMinor;
  }

  // Every rejection is a legitimate amount_below_minimum.
  assert.ok(rejected.every((r) => r.reason === 'amount_below_minimum'));
});

test('concurrency: two identical simultaneous bids — exactly one wins', async () => {
  const store = new MemoryAuctionStore();
  store.seedLot(makeLot());
  const mk = (id) => ({ lotId: 'lot-1', bidder: { bidderId: `tie:${id}`, verified: true, via: 'test' }, amountMinor: 100_000, idempotencyKey: `tie-${id}`, sleep: noSleep });
  const [a, b] = await Promise.all([placeBid(store, mk('a')), placeBid(store, mk('b'))]);
  const outcomes = [a.status, b.status].sort();
  assert.deepEqual(outcomes, ['accepted', 'rejected']);
  const lot = await store.getLot('lot-1');
  assert.equal(lot.bidCount, 1);
  assert.equal(lot.currentBidMinor, 100_000);
});

/* ── 8. Lazy close on read and on bid ── */

test('lazy close: a bid arriving after closesAt settles the lot and is rejected', async () => {
  const store = new MemoryAuctionStore();
  const past = Date.now() - 60_000;
  store.seedLot(makeLot({ closesAt: new Date(past).toISOString() }));
  const result = await placeBid(store, { lotId: 'lot-1', bidder: VERIFIED, amountMinor: 500_000, idempotencyKey: 'late-1', sleep: noSleep });
  assert.deepEqual({ status: result.status, reason: result.reason }, { status: 'rejected', reason: 'lot_closed' });
  const lot = await store.getLot('lot-1');
  assert.equal(lot.status, 'unsold'); // no bids -> unsold
  const transitions = store.auditTrail().filter((a) => a.action === 'lot.transition').map((a) => JSON.parse(a.detail).to);
  assert.deepEqual(transitions, ['closing', 'unsold']);
  const actions = store.auditTrail().map((a) => a.action);
  assert.ok(actions.includes('bid.rejected'));
});

test('lazy close: resolveLotNow and listLotsResolved apply due transitions via the state machine', async () => {
  const store = new MemoryAuctionStore();
  const past = Date.now() - 60_000;
  store.seedLot(makeLot({ id: 'lot-open' }));
  store.seedLot(makeLot({ id: 'lot-due', closesAt: new Date(past).toISOString(), bidCount: 1, currentBidMinor: 500_000, currentBidderId: 'bidder:ana', reserveMinor: 400_000 }));
  store.seedLot(makeLot({ id: 'lot-scheduled', status: 'scheduled', opensAt: new Date(past).toISOString() }));

  const resolved = await resolveLotNow(store, 'lot-due');
  assert.equal(resolved.status, 'sold');

  const lots = await listLotsResolved(store);
  const byId = Object.fromEntries(lots.map((l) => [l.id, l.status]));
  assert.deepEqual(byId, { 'lot-open': 'live', 'lot-due': 'sold', 'lot-scheduled': 'live' });
});

/* ── 9. Rate limiting (shared storage contract) ── */

test('rate limiting: hits above the per-window limit are rejected and audited', async () => {
  const store = new MemoryAuctionStore();
  store.seedLot(makeLot());
  const mk = (i) => ({ lotId: 'lot-1', bidder: VERIFIED, amountMinor: 100_000 + i * 10_000, idempotencyKey: `rl-${i}`, sleep: noSleep, rateLimitPerMinute: 3 });
  const results = [];
  for (let i = 0; i < 5; i++) results.push(await placeBid(store, mk(i)));
  assert.deepEqual(results.map((r) => r.status), ['accepted', 'accepted', 'accepted', 'rejected', 'rejected']);
  assert.deepEqual(results.slice(3).map((r) => r.reason), ['rate_limited', 'rate_limited']);
  assert.ok(store.auditTrail().filter((a) => a.action === 'bid.rate_limited').length === 2);
});

/* ── 10. Reserve at close through the public path ── */

test('reserve: lot closing below reserve ends unsold; at/above reserve ends sold', async () => {
  const store = new MemoryAuctionStore();
  const soon = Date.now() + 250; // inside any anti-snipe window; anti-snipe disabled to keep the close time
  store.seedLot(makeLot({ id: 'res-lot', reserveMinor: 1_000_000, antiSnipeSeconds: 0, closesAt: new Date(soon).toISOString() }));
  const bid = await placeBid(store, { lotId: 'res-lot', bidder: VERIFIED, amountMinor: 500_000, idempotencyKey: 'res-1', sleep: noSleep });
  assert.equal(bid.status, 'accepted');
  // Read after closesAt -> unsold (500_000 < 1_000_000 reserve).
  const after = await resolveLotNow(store, 'res-lot', new Date(soon + 1000));
  assert.equal(after.status, 'unsold');

  store.seedLot(makeLot({ id: 'res-lot-2', reserveMinor: 400_000, antiSnipeSeconds: 0, closesAt: new Date(soon).toISOString() }));
  await placeBid(store, { lotId: 'res-lot-2', bidder: VERIFIED, amountMinor: 500_000, idempotencyKey: 'res-2', sleep: noSleep });
  const won = await resolveLotNow(store, 'res-lot-2', new Date(soon + 1000));
  assert.equal(won.status, 'sold');
});
