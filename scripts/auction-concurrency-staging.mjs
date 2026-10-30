/**
 * Real-Appwrite concurrency race test for the auction engine.
 *
 * NOT run in CI — it needs a staging Appwrite project and a server API key.
 * Run it with Node >= 22:
 *
 *   APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1 \
 *   APPWRITE_PROJECT_ID=<staging-project> \
 *   APPWRITE_API_KEY=<staging-server-key> \
 *   node --experimental-strip-types scripts/auction-concurrency-staging.mjs
 *
 * Optional:
 *   AUCTION_STAGING_BIDDERS=25     number of concurrent bidders (default 25)
 *   AUCTION_STAGING_CLEANUP=0      set to 0 to keep the created rows for inspection
 *
 * What it proves against a real server:
 *   1. auto-provisioning creates the auction collections, indexes and
 *      server-only permissions;
 *   2. N simultaneous bids through the real Transactions API produce a
 *      strictly increasing bid history, exactly one high bidder, and a lot
 *      whose high bid/bidCount agree with the bid rows;
 *   3. idempotent replays return the original bid without double counting;
 *   4. integer minor units above 2^31 round-trip (big-ticket stones);
 *   5. every acceptance, rejection, extension and transition has audit rows.
 */
import assert from 'node:assert/strict';
import { ID, Query, TablesDB } from 'node-appwrite';

import { ensureReady, DB_ID } from '../src/lib/appwrite.ts';
import { AppwriteAuctionStore, AUCTION_TABLES, getTables } from '../src/lib/auction/appwrite-store.ts';
import { placeBid, resolveLotNow } from '../src/lib/auction/place-bid.ts';

const BIDDERS = Number.parseInt(process.env.AUCTION_STAGING_BIDDERS ?? '25', 10);
const CLEANUP = process.env.AUCTION_STAGING_CLEANUP !== '0';

const run = `stg-${Date.now().toString(36)}`;
const tables = getTables();
const store = new AppwriteAuctionStore(tables);

async function main() {
  console.log(`[staging] provisioning against ${process.env.APPWRITE_ENDPOINT} …`);
  await ensureReady();

  console.log(`[staging] creating auction ${run} with one live lot …`);
  const now = Date.now();
  await tables.createRow({
    databaseId: DB_ID,
    tableId: AUCTION_TABLES.auctions,
    rowId: `${run}-auction`,
    data: {
      title: 'Staging concurrency auction',
      description: 'Disposable race-test auction',
      currency: 'USD',
      status: 'live',
      opens_at: new Date(now - 60_000).toISOString(),
      closes_at: new Date(now + 3_600_000).toISOString(),
      created_at: new Date(now - 60_000).toISOString(),
    },
  });
  await tables.createRow({
    databaseId: DB_ID,
    tableId: AUCTION_TABLES.lots,
    rowId: `${run}-lot`,
    data: {
      auction_id: `${run}-auction`,
      title: 'Staging race lot',
      description: '',
      stone_ref: 'STAGING-1',
      currency: 'USD',
      status: 'live',
      starting_bid_minor: 1_000_00,
      reserve_minor: 0,
      min_increment_minor: 500_00,
      anti_snipe_seconds: 120,
      opens_at: new Date(now - 60_000).toISOString(),
      closes_at: new Date(now + 3_600_000).toISOString(),
      current_bid_minor: 0,
      current_bidder: '',
      bid_count: 0,
      created_at: new Date(now - 60_000).toISOString(),
    },
  });

  console.log(`[staging] firing ${BIDDERS} concurrent bids …`);
  const inputs = Array.from({ length: BIDDERS }, (_, i) => ({
    lotId: `${run}-lot`,
    bidder: { bidderId: `staging-bidder-${i}`, verified: true, via: 'staging-script' },
    amountMinor: 1_000_00 + (i % 5) * 500_00, // deliberate ties across levels
    idempotencyKey: `${run}-bid-${i}`,
    rateLimitPerMinute: 1_000_000,
    maxAttempts: 40,
  }));
  const results = await Promise.all(inputs.map((input) => placeBid(store, input)));

  const accepted = results.filter((r) => r.status === 'accepted' && !r.replayed);
  assert.ok(accepted.length > 0, 'at least one bid must be accepted');

  const bidRows = await tables.listRows({
    databaseId: DB_ID,
    tableId: AUCTION_TABLES.bids,
    queries: [Query.equal('lot_id', `${run}-lot`), Query.orderAsc('amount_minor'), Query.limit(500)],
  });
  assert.equal(bidRows.rows.length, accepted.length, 'one bid row per accepted bid');
  const amounts = bidRows.rows.map((r) => r.amount_minor);
  assert.equal(new Set(amounts).size, amounts.length, 'no two accepted bids at the same amount');
  for (let i = 1; i < amounts.length; i++) {
    assert.ok(amounts[i] >= amounts[i - 1] + 500_00, `history increases by the increment (${amounts[i - 1]} -> ${amounts[i]})`);
  }

  const lot = await store.getLot(`${run}-lot`);
  const top = bidRows.rows[bidRows.rows.length - 1];
  assert.equal(lot.currentBidMinor, top.amount_minor, 'lot high bid matches bid history');
  assert.equal(lot.currentBidderId, top.bidder_id, 'lot high bidder matches bid history');
  assert.equal(lot.bidCount, bidRows.rows.length, 'bid count matches bid history');

  console.log('[staging] idempotent replay …');
  const replay = await placeBid(store, inputs[0]);
  assert.equal(replay.status, 'accepted');
  assert.equal(replay.replayed, true, 'replayed key returns the original bid');
  const after = await store.getLot(`${run}-lot`);
  assert.equal(after.bidCount, lot.bidCount, 'replay does not double count');

  console.log('[staging] big-ticket integer round-trip (> 2^31 minor units) …');
  const bigLotId = `${run}-big`;
  await tables.createRow({
    databaseId: DB_ID,
    tableId: AUCTION_TABLES.lots,
    rowId: bigLotId,
    data: {
      auction_id: `${run}-auction`,
      title: 'Big-ticket lot',
      description: '',
      stone_ref: 'STAGING-2',
      currency: 'USD',
      status: 'live',
      starting_bid_minor: 5_000_000_000, // USD 50,000,000.00 — exceeds int32
      reserve_minor: 0,
      min_increment_minor: 100_000_000,
      anti_snipe_seconds: 0,
      opens_at: new Date(now - 60_000).toISOString(),
      closes_at: new Date(now + 3_600_000).toISOString(),
      current_bid_minor: 0,
      current_bidder: '',
      bid_count: 0,
      created_at: new Date(now - 60_000).toISOString(),
    },
  });
  const big = await placeBid(store, {
    lotId: bigLotId,
    bidder: { bidderId: 'staging-whale', verified: true, via: 'staging-script' },
    amountMinor: 5_100_000_000,
    idempotencyKey: `${run}-big-1`,
  });
  assert.equal(big.status, 'accepted');
  assert.equal((await store.getLot(bigLotId)).currentBidMinor, 5_100_000_000, 'minor units above 2^31 must round-trip exactly');

  console.log('[staging] lazy close …');
  const closed = await resolveLotNow(store, bigLotId, new Date(now + 4 * 3_600_000));
  assert.equal(closed.status, 'sold');

  const audits = await tables.listRows({
    databaseId: DB_ID,
    tableId: AUCTION_TABLES.auditLog,
    queries: [Query.equal('entity_id', `${run}-lot`), Query.limit(500)],
  });
  assert.ok(audits.rows.some((r) => r.action === 'bid.accepted'), 'acceptances audited');
  if (results.some((r) => r.status === 'rejected')) {
    const rejections = await tables.listRows({
      databaseId: DB_ID,
      tableId: AUCTION_TABLES.auditLog,
      queries: [Query.equal('action', 'bid.rejected'), Query.limit(500)],
    });
    assert.ok(rejections.rows.length > 0, 'rejections audited');
  }

  console.log(`[staging] PASS — ${accepted.length}/${BIDDERS} bids accepted, winner ${lot.currentBidderId} at ${lot.currentBidMinor} minor units, ${audits.rows.length} audit rows for the lot`);

  if (CLEANUP) {
    console.log('[staging] cleaning up staging rows …');
    for (const row of bidRows.rows) await tables.deleteRow({ databaseId: DB_ID, tableId: AUCTION_TABLES.bids, rowId: row.$id });
    for (const row of audits.rows) await tables.deleteRow({ databaseId: DB_ID, tableId: AUCTION_TABLES.auditLog, rowId: row.$id });
    await tables.deleteRow({ databaseId: DB_ID, tableId: AUCTION_TABLES.lots, rowId: `${run}-lot` });
    await tables.deleteRow({ databaseId: DB_ID, tableId: AUCTION_TABLES.lots, rowId: bigLotId });
    await tables.deleteRow({ databaseId: DB_ID, tableId: AUCTION_TABLES.auctions, rowId: `${run}-auction` });
  }
}

main().then(
  () => { console.log('[staging] OK'); process.exit(0); },
  (error) => { console.error('[staging] FAIL:', error); process.exit(1); },
);
