"use client";

/**
 * Client poll cadence for GET /api/lots. NEXT_PUBLIC_* values are inlined at
 * build time; both must be positive integers of milliseconds.
 *
 * The hidden-tab cadence is deliberately slow: auction outcomes never depend
 * on the client (lazy close + cron sweeper decide), so a background tab only
 * needs a gentle heartbeat and an immediate refresh on return.
 */
function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const AUCTION_POLL_INTERVAL_MS = positiveInt(
  process.env.NEXT_PUBLIC_AUCTION_POLL_INTERVAL_MS,
  5_000,
);

export const AUCTION_POLL_HIDDEN_INTERVAL_MS = positiveInt(
  process.env.NEXT_PUBLIC_AUCTION_POLL_HIDDEN_INTERVAL_MS,
  60_000,
);
