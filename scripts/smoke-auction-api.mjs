/**
 * Auction API smoke test (Phase 2b) — the scripted equivalent of a Playwright
 * catalogue -> bid -> outbid -> close pass, run over HTTP against a live
 * server seeded with scripts/seed-auction-staging.mjs.
 *
 * Why HTTP instead of a browser: the engine's contract is the API. The
 * browser-only rendering (modal, countdowns, toasts) is covered by the manual
 * checklist at the bottom of this file; everything that decides money is
 * asserted here against the real routes.
 *
 * Prerequisites:
 *   1. A staging Appwrite project + seed:
 *        node --experimental-strip-types scripts/seed-auction-staging.mjs
 *   2. The app running against that project:
 *        npm run dev        (or a staging deployment URL)
 *
 * Usage (Node >= 22):
 *   SESSION_SECRET=<the app's secret> \
 *   [SMOKE_BASE_URL=http://localhost:3000] \
 *   [CRON_SECRET=<staging cron secret>] \
 *   node scripts/smoke-auction-api.mjs
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const BASE = (process.env.SMOKE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const CRON_SECRET = process.env.CRON_SECRET || '';

function staffCookie() {
  const payload = JSON.stringify({ ts: Date.now(), role: 'owner' });
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `adb_session=${Buffer.from(payload).toString('base64url')}.${sig}`;
}

async function getLots(headers = {}) {
  const res = await fetch(`${BASE}/api/lots`, { headers, cache: 'no-store' });
  assert.equal(res.status, 200, `GET /api/lots -> ${res.status}`);
  return res.json();
}

async function postBid(lotId, amountMinor, idempotencyKey, cookie) {
  const res = await fetch(`${BASE}/api/lots/${lotId}/bids`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ amountMinor, idempotencyKey }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`[smoke] target: ${BASE}`);

  /* 1. Catalogue: projection + server clock over the wire. */
  const first = await getLots();
  assert.ok(Array.isArray(first.lots), 'lots array present');
  assert.equal(typeof first.serverTime, 'string', 'serverTime present for the client clock offset');
  assert.ok(Math.abs(Date.parse(first.serverTime) - Date.now()) < 60_000, 'serverTime is sane');
  assert.equal(typeof first.biddingEnabled, 'boolean', 'bidding capability advertised');
  for (const lot of first.lots) {
    assert.equal('reserveMinor' in lot, false, `projection leak: reserveMinor on ${lot.id}`);
    assert.equal('currentBidderId' in lot, false, `projection leak: currentBidderId on ${lot.id}`);
    assert.equal('reserve' in lot, false, `projection leak: reserve on ${lot.id}`);
  }
  console.log(`[smoke] catalogue OK — ${first.lots.length} lots, projection clean, serverTime present`);
  assert.ok(first.lots.length > 0, 'no lots — run scripts/seed-auction-staging.mjs first');

  /* 2. The gate: an anonymous visitor may not bid. */
  const live = first.lots.find((l) => l.status === 'live');
  assert.ok(live, 'seed should include at least one live lot');
  const anon = await postBid(live.id, live.startingBidMinor, `smoke-anon-${Date.now()}`, null);
  assert.equal(anon.status, 401, `anonymous bid rejected (${anon.status})`);
  assert.equal(anon.body?.reason, 'unauthenticated');
  assert.equal(first.biddingEnabled, false, 'anonymous catalogue says bidding disabled');
  console.log('[smoke] gate OK — anonymous bid -> 401 unauthenticated');

  /* 3. Staff session: bid -> replay -> outbid. */
  if (!SESSION_SECRET) {
    console.log('[smoke] SKIP staff bid flow: SESSION_SECRET not set');
  } else {
    const cookie = staffCookie();
    const authed = await getLots({ Cookie: cookie });
    assert.equal(authed.biddingEnabled, true, 'staff session may bid');

    const before = authed.lots.find((l) => l.id === live.id);
    const minimum = before.bidCount === 0 ? before.startingBidMinor : before.currentBidMinor + before.minIncrementMinor;
    const key = `smoke-${Date.now()}-a`;

    const bid1 = await postBid(live.id, minimum, key, cookie);
    assert.equal(bid1.status, 201, `first bid accepted (${bid1.status}: ${JSON.stringify(bid1.body)})`);
    assert.equal(bid1.body.ok, true);
    assert.equal(bid1.body.replayed, false);

    const replay = await postBid(live.id, minimum, key, cookie);
    assert.equal(replay.status, 200, 'idempotent replay returns 200');
    assert.equal(replay.body.replayed, true, 'replay flagged');
    assert.equal(replay.body.lot.bidCount, bid1.body.lot.bidCount, 'replay did not double count');

    const tooLow = await postBid(live.id, minimum, `smoke-${Date.now()}-low`, cookie);
    assert.equal(tooLow.status, 409, `too-low bid rejected (${tooLow.status})`);
    assert.equal(tooLow.body.reason, 'amount_below_minimum');
    assert.equal(typeof tooLow.body.minimumMinor, 'number', 'engine names the new minimum');

    const outbid = await postBid(live.id, tooLow.body.minimumMinor, `smoke-${Date.now()}-b`, cookie);
    assert.equal(outbid.status, 201, `outbid accepted (${outbid.status})`);
    console.log(`[smoke] bid flow OK — accepted at ${minimum}, replayed, rejected ${minimum} as too low, outbid at ${tooLow.body.minimumMinor}`);
  }

  /* 4. Close: the flash lot hammers via lazy close on read (or the sweeper). */
  const flash = first.lots.find((l) => l.id === 'seed-demo-lot-flash');
  if (!flash) {
    console.log('[smoke] SKIP close watch: seed-demo-lot-flash not present (seed longer ago than ~90s?)');
  } else if (flash.status === 'sold' || flash.status === 'unsold') {
    console.log(`[smoke] close OK — flash lot already settled (${flash.status})`);
  } else {
    console.log('[smoke] waiting for the flash lot to hammer (lazy close on read)…');
    const deadline = Date.now() + 5 * 60_000;
    let settled = null;
    while (Date.now() < deadline) {
      await sleep(3_000);
      const poll = await getLots();
      const f = poll.lots.find((l) => l.id === 'seed-demo-lot-flash');
      if (f && (f.status === 'sold' || f.status === 'unsold')) { settled = f; break; }
    }
    assert.ok(settled, 'flash lot did not settle within 5 minutes');
    console.log(`[smoke] close OK — flash lot settled as ${settled.status} with ${settled.bidCount} bids`);
  }

  /* 5. Sweeper endpoint auth (only when CRON_SECRET is configured). */
  if (!CRON_SECRET) {
    console.log('[smoke] SKIP cron check: CRON_SECRET not set');
  } else {
    const unauth = await fetch(`${BASE}/api/cron/close-lots`);
    assert.equal(unauth.status, 401, `sweeper rejects anonymous (${unauth.status})`);
    const auth = await fetch(`${BASE}/api/cron/close-lots`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    assert.equal(auth.status, 200, `sweeper runs with the secret (${auth.status})`);
    const summary = await auth.json();
    assert.equal(summary.ok, true);
    console.log(`[smoke] sweeper OK — scanned ${summary.scanned}, transitioned ${summary.transitioned.length}, notified ${summary.notified.length}`);
  }

  console.log('[smoke] PASS');
}

main().then(
  () => process.exit(0),
  (error) => { console.error('[smoke] FAIL:', error?.message ?? error); process.exit(1); },
);

/*
MANUAL BROWSER CHECKLIST (the rendering half of the Playwright pass)
--------------------------------------------------------------------
Against the seeded staging deployment, in a browser:

 1. Catalogue renders the seeded lots with Open/Upcoming/Hammered/Unsold
    chips; no DEMO_LOTS content; "Flash Lot" counts down ~90s.
 2. Countdowns match the server clock (compare with a second device whose
    clock is wrong — the countdown must still be right).
 3. Logged out: "Place bid" opens the Licensed Dealer gate, not the bid modal.
 4. Staff session (/login): "Place bid" opens the modal; submit the minimum;
    toast "Bid placed"; the catalogue count increments within one poll tick.
 5. Submit again with the same amount -> "Bid too low — the minimum bid is …".
 6. Wait out the flash lot: its card flips to Hammered/Unsold without a reload
    and appears in Results. (Anti-snipe extends it 60s if you bid late.)
 7. Hide the tab for a minute and return: data refreshes immediately.
 8. Empty state: after `--clean`, the catalogue shows "No auction is live
    right now." and the hero shows "To be announced".
*/
