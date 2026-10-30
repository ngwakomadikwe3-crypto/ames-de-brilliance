/**
 * Phase 2b tests (node:test, Node >= 22 strip-types):
 *   1. API projection — no reserve amounts or bidder identities can leak.
 *   2. Server-clock offset math and countdown formatting.
 *   3. Rejection-reason rendering for the bid modal.
 *   4. Sweeper: closes due lots via the same lazy-close path, idempotently,
 *      and safely concurrently with a racing lazy close.
 *   5. Notification-failure isolation: email failures never block or roll
 *      back a close, and the next sweep retries.
 *
 * Runs entirely against MemoryAuctionStore. The over-the-wire projection
 * assertion lives in scripts/smoke-auction-api.mjs (needs a running server).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  computeOffsetMs,
  formatCountdown,
  serverNowMs,
} from '../src/lib/auction/clock.ts';
import {
  projectLot,
  publicMinimumBidMinor,
  reserveMetVisibleFromEnv,
} from '../src/lib/auction/public-projection.ts';
import { bidRejectionMessage } from '../src/components/auction/bid-errors.ts';
import { notifyLotClosed } from '../src/lib/auction/close-notify.ts';
import { MemoryAuctionStore } from '../src/lib/auction/memory-store.ts';
import { placeBid, resolveLotNow } from '../src/lib/auction/place-bid.ts';
import { sweepExpiredLots } from '../src/lib/auction/sweeper.ts';

const noSleep = () => Promise.resolve();
const VERIFIED = { bidderId: 'bidder:ana', verified: true, via: 'test' };

function makeLot(overrides = {}) {
  const now = Date.now();
  return {
    id: 'lot-1',
    auctionId: 'auction-1',
    title: 'Test lot',
    description: '',
    stoneRef: 'AM-001',
    currency: 'USD',
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

/* ── 1. Projection ── */

test('projection: reserve amount and bidder identity never leave the server', () => {
  const lot = makeLot({
    reserveMinor: 9_876_543,
    currentBidMinor: 8_000_000,
    currentBidderId: 'bidder:secret-identity',
    bidCount: 4,
  });
  for (const showReserveMet of [false, true]) {
    const projected = projectLot(lot, { showReserveMet });
    assert.equal('reserveMinor' in projected, false);
    assert.equal('currentBidderId' in projected, false);
    const json = JSON.stringify(projected);
    assert.equal(json.includes('reserveMinor'), false);
    assert.equal(json.includes('currentBidderId'), false);
    assert.equal(json.includes('9876543'), false, 'reserve amount must not appear, even as a substring');
    assert.equal(json.includes('secret-identity'), false, 'bidder identity must not appear');
  }
});

test('projection: reserveMet boolean only behind the flag, never the amount', () => {
  const met = makeLot({ reserveMinor: 100_000, currentBidMinor: 120_000, bidCount: 1 });
  const unmet = makeLot({ reserveMinor: 100_000, currentBidMinor: 90_000, bidCount: 1 });
  const noReserve = makeLot({ reserveMinor: 0, currentBidMinor: 50_000, bidCount: 1 });

  assert.equal('reserveMet' in projectLot(met, { showReserveMet: false }), false, 'default off');
  assert.equal(projectLot(met, { showReserveMet: true }).reserveMet, true);
  assert.equal(projectLot(unmet, { showReserveMet: true }).reserveMet, false);
  assert.equal('reserveMet' in projectLot(noReserve, { showReserveMet: true }), false, 'no reserve, no flag');
});

test('projection: reserveMetVisibleFromEnv defaults off and only accepts "1"', () => {
  assert.equal(reserveMetVisibleFromEnv({}), false);
  assert.equal(reserveMetVisibleFromEnv({ AUCTION_SHOW_RESERVE_MET: '0' }), false);
  assert.equal(reserveMetVisibleFromEnv({ AUCTION_SHOW_RESERVE_MET: 'true' }), false);
  assert.equal(reserveMetVisibleFromEnv({ AUCTION_SHOW_RESERVE_MET: '1' }), true);
});

test('projection: publicMinimumBidMinor mirrors the engine rule', () => {
  assert.equal(publicMinimumBidMinor(projectLot(makeLot(), { showReserveMet: false })), 100_000);
  const withBid = makeLot({ currentBidMinor: 250_000, bidCount: 2 });
  assert.equal(publicMinimumBidMinor(projectLot(withBid, { showReserveMet: false })), 260_000);
});

/* ── 2. Server clock ── */

test('clock: offset math in both directions, invalid input safe', () => {
  const client = 1_700_000_000_000;
  assert.equal(computeOffsetMs(new Date(client + 5_000).toISOString(), client), 5_000, 'server ahead');
  assert.equal(computeOffsetMs(new Date(client - 3_000).toISOString(), client), -3_000, 'server behind');
  assert.equal(computeOffsetMs('not-a-date', client), 0, 'invalid input falls back to zero offset');
  assert.equal(serverNowMs(5_000, client), client + 5_000);
});

test('clock: countdown formatting at the boundaries', () => {
  const t0 = Date.parse('2026-06-01T12:00:00.000Z');
  // past and invalid
  assert.equal(formatCountdown(new Date(t0 - 1).toISOString(), t0), 'Closed');
  assert.equal(formatCountdown('garbage', t0), 'Closed');
  // exactly on the boundary counts as closed
  assert.equal(formatCountdown(new Date(t0).toISOString(), t0), 'Closed');
  // sub-day includes seconds
  assert.equal(formatCountdown(new Date(t0 + 90_000).toISOString(), t0), '0h 01m 30s');
  assert.equal(formatCountdown(new Date(t0 + 2 * 3_600_000 + 14 * 60_000 + 5_000).toISOString(), t0), '2h 14m 05s');
  // exactly 24h is still the detailed form (h > 24 switches to days)
  assert.equal(formatCountdown(new Date(t0 + 24 * 3_600_000).toISOString(), t0), '24h 00m 00s');
  // multi-day collapses to d/h
  assert.equal(formatCountdown(new Date(t0 + 25 * 3_600_000).toISOString(), t0), '1d 1h');
  assert.equal(formatCountdown(new Date(t0 + 3 * 86_400_000).toISOString(), t0), '3d 0h');
});

/* ── 3. Rejection-reason rendering ── */

test('rejection rendering: every engine reason maps to a human sentence', () => {
  const reasons = [
    'amount_below_minimum',
    'lot_not_live',
    'lot_closed',
    'bidder_unverified',
    'rate_limited',
    'lot_not_found',
    'unauthenticated',
    'invalid_body',
    'invalid_json',
    'invalid_lot_id',
    'internal_error',
    'something_unexpected',
  ];
  for (const reason of reasons) {
    const msg = bidRejectionMessage(reason, { currency: 'USD' });
    assert.ok(msg.length > 10, `${reason} produced a message`);
    assert.ok(!msg.includes(reason), `${reason} must not surface as a raw code`);
  }
});

test('rejection rendering: too-low bids name the engine-provided minimum', () => {
  const msg = bidRejectionMessage('amount_below_minimum', { minimumMinor: 12_345_600, currency: 'USD' });
  assert.ok(msg.includes('$123,456.00'), `minimum formatted into the message: ${msg}`);
  const noMin = bidRejectionMessage('amount_below_minimum', { currency: 'USD' });
  assert.ok(noMin.includes('too low'));
});

test('rejection rendering: closed and unverified read distinctly', () => {
  assert.ok(bidRejectionMessage('lot_closed', { currency: 'USD' }).includes('closed'));
  assert.ok(bidRejectionMessage('bidder_unverified', { currency: 'USD' }).includes('verified'));
  assert.ok(bidRejectionMessage('rate_limited', { currency: 'USD' }).includes('moment'));
});

/* ── 4. Sweeper ── */

test('sweeper: closes a due lot through the lazy-close path and notifies', async () => {
  const store = new MemoryAuctionStore();
  const past = Date.now() - 60_000;
  store.seedLot(makeLot({ id: 'lot-due', closesAt: new Date(past).toISOString() }));
  await placeBid(store, {
    lotId: 'lot-due',
    bidder: VERIFIED,
    amountMinor: 150_000,
    idempotencyKey: 'sweeper-test-bid-1',
    now: new Date(past - 60_000), // bid landed while the lot was still live
    sleep: noSleep,
  });

  const sent = [];
  const now = new Date();
  const summary = await sweepExpiredLots(store, {
    now,
    notify: {
      sendMail: async (msg) => { sent.push(msg); return true; },
      houseEmail: 'desk@example.com',
      resolveWinnerEmail: async (bidderId) => (bidderId === 'bidder:ana' ? 'ana@example.com' : null),
    },
  });

  assert.deepEqual(summary.transitioned, [{ lotId: 'lot-due', from: 'live', to: 'sold' }]);
  assert.deepEqual(summary.notified, ['lot-due']);
  assert.deepEqual(summary.notifyFailed, []);
  const lot = await store.getLot('lot-due');
  assert.equal(lot.status, 'sold');
  assert.equal(lot.closeNotifyStatus, 'sent');
  // house + winner both emailed
  assert.deepEqual(sent.map((m) => m.to).sort(), ['ana@example.com', 'desk@example.com']);
  assert.ok(sent[0].subject.includes('[AMES]'));
  // audited
  assert.ok(store.auditTrail().some((e) => e.action === 'lot.close_notified' && e.entityId === 'lot-due'));
});

test('sweeper: reserve not met closes unsold and sends no email', async () => {
  const store = new MemoryAuctionStore();
  store.seedLot(makeLot({
    id: 'lot-unmet',
    reserveMinor: 500_000,
    currentBidMinor: 150_000,
    currentBidderId: 'bidder:ana',
    bidCount: 1,
    closesAt: new Date(Date.now() - 1000).toISOString(),
  }));
  const sent = [];
  const summary = await sweepExpiredLots(store, {
    notify: { sendMail: async (m) => { sent.push(m); return true; }, houseEmail: 'desk@example.com' },
  });
  assert.deepEqual(summary.transitioned, [{ lotId: 'lot-unmet', from: 'live', to: 'unsold' }]);
  assert.equal(sent.length, 0);
  assert.equal((await store.getLot('lot-unmet')).status, 'unsold');
});

test('sweeper: second run is a full no-op (idempotent)', async () => {
  const store = new MemoryAuctionStore();
  store.seedLot(makeLot({ id: 'lot-twice', closesAt: new Date(Date.now() - 1000).toISOString() }));
  let calls = 0;
  const notify = { sendMail: async () => { calls += 1; return true; }, houseEmail: 'desk@example.com' };

  const first = await sweepExpiredLots(store, { notify });
  assert.equal(first.transitioned.length, 1);
  // No bids -> unsold -> no notification expected; use a sold lot for notify idempotency.
  store.seedLot(makeLot({
    id: 'lot-twice-sold',
    currentBidMinor: 150_000,
    currentBidderId: 'bidder:ana',
    bidCount: 1,
    closesAt: new Date(Date.now() - 1000).toISOString(),
  }));
  await sweepExpiredLots(store, { notify });
  assert.equal(calls, 1, 'house email sent once');

  const third = await sweepExpiredLots(store, { notify });
  assert.deepEqual(third.transitioned, []);
  assert.deepEqual(third.notified, []);
  assert.equal(calls, 1, 'no duplicate email on later sweeps');
});

test('sweeper: safe concurrently with a racing lazy close', async () => {
  const store = new MemoryAuctionStore();
  store.seedLot(makeLot({
    id: 'lot-race',
    currentBidMinor: 150_000,
    currentBidderId: 'bidder:ana',
    bidCount: 1,
    closesAt: new Date(Date.now() - 1000).toISOString(),
  }));
  const sent = [];
  const now = new Date();
  const [summary, resolved] = await Promise.all([
    sweepExpiredLots(store, {
      now,
      notify: { sendMail: async (m) => { sent.push(m); return true; }, houseEmail: 'desk@example.com' },
    }),
    resolveLotNow(store, 'lot-race', now),
  ]);
  assert.equal(resolved.status, 'sold');
  assert.equal((await store.getLot('lot-race')).status, 'sold');
  // The transition happened exactly once across both racers.
  const transitions = store.auditTrail().filter((e) => e.action === 'lot.transition' && e.entityId === 'lot-race');
  assert.equal(transitions.length, 2, 'live->closing->sold, once each');
  assert.ok(sent.length >= 1);
  assert.equal((await store.getLot('lot-race')).closeNotifyStatus, 'sent');
  assert.ok(summary.transitioned.length <= 1, 'at most one racer reports the transition');
});

test('notification failure: close is not blocked or rolled back, next sweep retries', async () => {
  const store = new MemoryAuctionStore();
  store.seedLot(makeLot({
    id: 'lot-flaky',
    currentBidMinor: 150_000,
    currentBidderId: 'bidder:ana',
    bidCount: 1,
    closesAt: new Date(Date.now() - 1000).toISOString(),
  }));

  let mode = 'throw';
  const sendMail = async () => {
    if (mode === 'throw') throw new Error('SMTP connection refused');
    if (mode === 'false') return false;
    return true;
  };
  const notify = { sendMail, houseEmail: 'desk@example.com' };

  // Sweep 1: sendMail throws. The lot must still be closed (sold).
  const first = await sweepExpiredLots(store, { notify });
  assert.deepEqual(first.notifyFailed, ['lot-flaky']);
  const afterFail = await store.getLot('lot-flaky');
  assert.equal(afterFail.status, 'sold', 'close committed despite email failure');
  assert.equal(afterFail.closeNotifyStatus, 'failed');
  assert.match(afterFail.closeNotifyError, /send failed: house/);
  assert.ok(store.auditTrail().some((e) => e.action === 'lot.close_notify_failed'));

  // Sweep 2: sendMail returns false — same isolation, still retriable.
  mode = 'false';
  const second = await sweepExpiredLots(store, { notify });
  assert.deepEqual(second.notifyFailed, ['lot-flaky']);
  assert.equal((await store.getLot('lot-flaky')).closeNotifyStatus, 'failed');

  // Sweep 3: SMTP recovered — retry succeeds.
  mode = 'ok';
  const third = await sweepExpiredLots(store, { notify });
  assert.deepEqual(third.notified, ['lot-flaky']);
  assert.equal((await store.getLot('lot-flaky')).closeNotifyStatus, 'sent');
  assert.ok(store.auditTrail().some((e) => e.action === 'lot.close_notified'));
});

test('notification: winner copy skipped (not failed) when no address resolves', async () => {
  const store = new MemoryAuctionStore();
  store.seedLot(makeLot({
    id: 'lot-stub',
    status: 'sold',
    currentBidMinor: 150_000,
    currentBidderId: 'staff:session',
    bidCount: 1,
  }));
  const sent = [];
  const outcome = await notifyLotClosed(store, await store.getLot('lot-stub'), {
    sendMail: async (m) => { sent.push(m); return true; },
    houseEmail: 'desk@example.com',
    resolveWinnerEmail: async () => null, // Phase 2a staff stub
  });
  assert.equal(outcome, 'sent');
  assert.deepEqual(sent.map((m) => m.to), ['desk@example.com'], 'house only — winner waits for Phase 3');
});

test('notification: notifyLotClosed never throws, even if the store misbehaves', async () => {
  const store = new MemoryAuctionStore();
  store.seedLot(makeLot({
    id: 'lot-bad-store',
    status: 'sold',
    currentBidMinor: 150_000,
    currentBidderId: 'bidder:ana',
    bidCount: 1,
  }));
  store.updateLotCloseNotification = async () => { throw new Error('disk on fire'); };
  store.appendAudit = async () => { throw new Error('audit on fire'); };
  const outcome = await notifyLotClosed(store, await store.getLot('lot-bad-store'), {
    sendMail: async () => true,
    houseEmail: 'desk@example.com',
  });
  // Emails went out, but the 'sent' marker could not be persisted: the honest
  // outcome is 'failed' so the next sweep retries — and nothing threw.
  assert.equal(outcome, 'failed');
});
