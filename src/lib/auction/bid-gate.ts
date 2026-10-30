import { currentTermsVersion, publicBiddingEnabled } from './flags.ts';
import type { BidderIdentity } from './types.ts';

/**
 * Phase 3a bid gate — the single source of truth for "may this identity bid
 * right now?". The POST /api/lots/[id]/bids route calls this before any bid
 * work; unit tests exercise it directly. Pure: env injectable.
 *
 * - Staff house identity (via !== 'bidder-account'): always allowed, exactly
 *   as in Phase 2b. Not subject to the flag or the terms gate.
 * - Bidder account: needs AUCTION_PUBLIC_BIDDING on, verified status (the
 *   resolver re-reads the row per request, so suspension bites immediately),
 *   and acceptance of the CURRENT terms version.
 */
export type BidGateResult = { ok: true } | { ok: false; reason: 'bidding_not_open' | 'bidder_unverified' | 'terms_not_accepted' };

export function checkBidGate(identity: BidderIdentity, env: NodeJS.ProcessEnv = process.env): BidGateResult {
  if (identity.via !== 'bidder-account') return { ok: true };
  if (!publicBiddingEnabled(env)) return { ok: false, reason: 'bidding_not_open' };
  if (!identity.verified) return { ok: false, reason: 'bidder_unverified' };
  if ((identity.termsVersion ?? '') !== currentTermsVersion(env)) return { ok: false, reason: 'terms_not_accepted' };
  return { ok: true };
}

/**
 * The catalogue-side mirror: would this identity pass the gate right now?
 * GET /api/lots uses it to tell the UI whether to open the bid modal or the
 * registration flow. Null identity → false.
 */
export function biddingEnabledFor(identity: BidderIdentity | null, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!identity) return false;
  return checkBidGate(identity, env).ok;
}
