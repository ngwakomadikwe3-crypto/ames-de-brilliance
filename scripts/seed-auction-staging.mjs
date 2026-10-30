/**
 * Staging-only seed script for the auction UI (Phase 2b).
 *
 * Creates one demo auction with six lots so the homepage can be exercised
 * end-to-end against a staging Appwrite project:
 *
 *   seed-demo-lot-1      live, closes in ~2h        (bid target)
 *   seed-demo-lot-2      live, closes in ~5h 42m    (bid target)
 *   seed-demo-lot-3      scheduled, opens in ~26h   (upcoming state)
 *   seed-demo-lot-flash  live, closes in ~90s       (watch the hammer fall)
 *   seed-demo-lot-sold   already hammered           (results table)
 *   seed-demo-lot-unsold already closed, no sale    (results table)
 *
 * SAFETY: refuses to run when NODE_ENV=production or PRODUCTION is set to a
 * truthy value. Deterministic row ids make re-runs idempotent (rows are
 * updated, not duplicated).
 *
 * Usage (Node >= 22):
 *
 *   APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1 \
 *   APPWRITE_PROJECT_ID=<staging-project> \
 *   APPWRITE_API_KEY=<staging-server-key> \
 *   node --experimental-strip-types scripts/seed-auction-staging.mjs
 *
 *   Add --clean to delete the seed rows instead.
 */
import { Query } from 'node-appwrite';

import { DB_ID, ensureReady } from '../src/lib/appwrite.ts';
import { AUCTION_TABLES, getTables } from '../src/lib/auction/appwrite-store.ts';

const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
const prodFlag = (process.env.PRODUCTION || '').toLowerCase();
if (nodeEnv === 'production' || ['1', 'true', 'yes'].includes(prodFlag)) {
  console.error('[seed] REFUSING TO RUN: production environment detected (NODE_ENV=production or PRODUCTION set).');
  process.exit(1);
}
if (!process.env.APPWRITE_ENDPOINT || !process.env.APPWRITE_PROJECT_ID || !process.env.APPWRITE_API_KEY) {
  console.error('[seed] APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID and APPWRITE_API_KEY are required (use the STAGING project).');
  process.exit(1);
}

const CLEAN = process.argv.includes('--clean');
const tables = getTables();

const AUCTION_ID = 'seed-demo-auction';
const now = Date.now();
const HOUR = 3_600_000;
const DAY = 86_400_000;

const auctionRow = {
  title: 'Staging Demonstration Auction',
  description: 'Seed data for exercising the Phase 2b auction UI. Not real stones.',
  currency: 'USD',
  status: 'live',
  opens_at: new Date(now - HOUR).toISOString(),
  closes_at: new Date(now + 3 * DAY).toISOString(),
  created_at: new Date(now - HOUR).toISOString(),
};

const lotRows = [
  {
    rowId: 'seed-demo-lot-1',
    data: {
      auction_id: AUCTION_ID,
      title: 'Jwaneng Select Parcel — 4.82 ct',
      description: '4.82 ct · D–F · VVS1–VS2 · Mixed crystal',
      stone_ref: 'SD-001',
      currency: 'USD',
      status: 'live',
      starting_bid_minor: 1_800_000,
      reserve_minor: 1_800_000,
      min_increment_minor: 25_000,
      anti_snipe_seconds: 120,
      opens_at: new Date(now - HOUR).toISOString(),
      closes_at: new Date(now + 2 * HOUR + 14 * 60_000).toISOString(),
      current_bid_minor: 0,
      current_bidder: '',
      bid_count: 0,
      close_notify_status: '',
      close_notify_error: '',
      created_at: new Date(now - HOUR).toISOString(),
    },
  },
  {
    rowId: 'seed-demo-lot-2',
    data: {
      auction_id: AUCTION_ID,
      title: 'Orapa Dodecahedron Parcel — 3.16 ct',
      description: '3.16 ct · G–H · VS1–SI1 · Dodecahedron',
      stone_ref: 'SD-002',
      currency: 'USD',
      status: 'live',
      starting_bid_minor: 950_000,
      reserve_minor: 0,
      min_increment_minor: 25_000,
      anti_snipe_seconds: 120,
      opens_at: new Date(now - HOUR).toISOString(),
      closes_at: new Date(now + 5 * HOUR + 42 * 60_000).toISOString(),
      current_bid_minor: 0,
      current_bidder: '',
      bid_count: 0,
      close_notify_status: '',
      close_notify_error: '',
      created_at: new Date(now - HOUR).toISOString(),
    },
  },
  {
    rowId: 'seed-demo-lot-3',
    data: {
      auction_id: AUCTION_ID,
      title: 'Karowe Exceptional — 2.04 ct',
      description: '2.04 ct · D · VVS2 · Octahedron',
      stone_ref: 'SD-003',
      currency: 'USD',
      status: 'scheduled',
      starting_bid_minor: 3_200_000,
      reserve_minor: 3_200_000,
      min_increment_minor: 50_000,
      anti_snipe_seconds: 300,
      opens_at: new Date(now + 26 * HOUR).toISOString(),
      closes_at: new Date(now + 2 * DAY + 2 * HOUR).toISOString(),
      current_bid_minor: 0,
      current_bidder: '',
      bid_count: 0,
      close_notify_status: '',
      close_notify_error: '',
      created_at: new Date(now - HOUR).toISOString(),
    },
  },
  {
    rowId: 'seed-demo-lot-flash',
    data: {
      auction_id: AUCTION_ID,
      title: 'Flash Lot — closes ~90s after seeding',
      description: '0.85 ct · E · VVS2 · Round Brilliant',
      stone_ref: 'SD-FLASH',
      currency: 'USD',
      status: 'live',
      starting_bid_minor: 100_000,
      reserve_minor: 0,
      min_increment_minor: 10_000,
      anti_snipe_seconds: 60,
      opens_at: new Date(now - 60_000).toISOString(),
      closes_at: new Date(now + 90_000).toISOString(),
      current_bid_minor: 0,
      current_bidder: '',
      bid_count: 0,
      close_notify_status: '',
      close_notify_error: '',
      created_at: new Date(now - 60_000).toISOString(),
    },
  },
  {
    rowId: 'seed-demo-lot-sold',
    data: {
      auction_id: AUCTION_ID,
      title: 'River Bracelet — 2.40 ct',
      description: '2.40 ct · G–H · VS2 · Channel set rounds',
      stone_ref: 'SD-008',
      currency: 'USD',
      status: 'sold',
      starting_bid_minor: 480_000,
      reserve_minor: 480_000,
      min_increment_minor: 20_000,
      anti_snipe_seconds: 120,
      opens_at: new Date(now - 3 * DAY).toISOString(),
      closes_at: new Date(now - 2 * DAY).toISOString(),
      current_bid_minor: 560_000,
      current_bidder: 'seed:previous-winner',
      bid_count: 3,
      // Pre-marked so the sweeper never emails anyone about seed data.
      close_notify_status: 'sent',
      close_notify_error: '',
      close_notified_at: new Date(now - 2 * DAY).toISOString(),
      created_at: new Date(now - 3 * DAY).toISOString(),
    },
  },
  {
    rowId: 'seed-demo-lot-unsold',
    data: {
      auction_id: AUCTION_ID,
      title: 'Letlhakane Mixed — 6.31 ct',
      description: '6.31 ct · J–K · SI1–SI2 · Macles',
      stone_ref: 'SD-004',
      currency: 'USD',
      status: 'unsold',
      starting_bid_minor: 720_000,
      reserve_minor: 720_000,
      min_increment_minor: 25_000,
      anti_snipe_seconds: 120,
      opens_at: new Date(now - 2 * DAY).toISOString(),
      closes_at: new Date(now - DAY).toISOString(),
      current_bid_minor: 0,
      current_bidder: '',
      bid_count: 0,
      close_notify_status: '',
      close_notify_error: '',
      created_at: new Date(now - 2 * DAY).toISOString(),
    },
  },
];

async function upsert(tableId, rowId, data) {
  try {
    await tables.createRow({ databaseId: DB_ID, tableId, rowId, data });
    return 'created';
  } catch (error) {
    if (error?.code === 409) {
      await tables.updateRow({ databaseId: DB_ID, tableId, rowId, data });
      return 'updated';
    }
    throw error;
  }
}

async function removeIfExists(tableId, rowId) {
  try {
    await tables.deleteRow({ databaseId: DB_ID, tableId, rowId });
    return true;
  } catch (error) {
    if (error?.code === 404) return false;
    throw error;
  }
}

async function main() {
  console.log(`[seed] provisioning staging project at ${process.env.APPWRITE_ENDPOINT} …`);
  await ensureReady();

  if (CLEAN) {
    let removed = 0;
    for (const lot of lotRows) {
      if (await removeIfExists(AUCTION_TABLES.lots, lot.rowId)) removed += 1;
    }
    if (await removeIfExists(AUCTION_TABLES.auctions, AUCTION_ID)) removed += 1;
    // Bids placed during UI exercise have random ids — remove by query.
    const bids = await tables.listRows({
      databaseId: DB_ID,
      tableId: AUCTION_TABLES.bids,
      queries: [Query.startsWith('lot_id', 'seed-demo-'), Query.limit(500)],
    });
    for (const row of bids.rows) {
      await tables.deleteRow({ databaseId: DB_ID, tableId: AUCTION_TABLES.bids, rowId: row.$id });
      removed += 1;
    }
    console.log(`[seed] CLEAN — removed ${removed} rows.`);
    return;
  }

  console.log('[seed] upserting demo auction + lots …');
  const a = await upsert(AUCTION_TABLES.auctions, AUCTION_ID, auctionRow);
  console.log(`[seed]   auction ${AUCTION_ID}: ${a}`);
  for (const lot of lotRows) {
    const outcome = await upsert(AUCTION_TABLES.lots, lot.rowId, lot.data);
    console.log(`[seed]   lot ${lot.rowId}: ${outcome} (${lot.data.status})`);
  }

  console.log('');
  console.log('[seed] DONE. Open the staging homepage:');
  console.log('       - catalogue shows the live/upcoming/closed lots above');
  console.log('       - staff session: bid on seed-demo-lot-1 or -2 (anti-snipe active)');
  console.log('       - flash lot hammers ~90s after this seed ran (watch via catalogue)');
  console.log('       - results table shows the sold and unsold lots');
  console.log('[seed] Remove everything with: node --experimental-strip-types scripts/seed-auction-staging.mjs --clean');
}

main().then(
  () => process.exit(0),
  (error) => { console.error('[seed] FAIL:', error); process.exit(1); },
);
