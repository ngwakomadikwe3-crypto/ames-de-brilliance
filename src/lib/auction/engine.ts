import { assertTransition, isTerminal } from './state-machine.ts';
import type { BidderIdentity, Lot, LotStatus } from './types.ts';

/**
 * Pure bid-engine decisions. No I/O, no Date.now() — the caller passes `now`
 * so every rule is deterministic and unit-testable. Storage adapters execute
 * the decisions; this module never touches Appwrite.
 */

export type BidRejectReason =
  | 'lot_not_live'
  | 'lot_closed'
  | 'bidder_unverified'
  | 'amount_below_minimum';

export interface BidPatch {
  currentBidMinor: number;
  currentBidderId: string;
  bidCount: number;
  closesAt: string;
}

export type BidDecision =
  | { ok: true; patch: BidPatch; extended: boolean }
  | { ok: false; reason: BidRejectReason; minimumMinor?: number };

/** Smallest amount (minor units) a new bid must meet or exceed. */
export function minimumBidMinor(lot: Lot): number {
  return lot.bidCount === 0
    ? lot.startingBidMinor
    : lot.currentBidMinor + lot.minIncrementMinor;
}

/**
 * Time-driven transitions that apply to the lot at `now`, in application
 * order, each validated against the state machine:
 *   scheduled -> live       (once opensAt is reached)
 *   live      -> closing    (once closesAt is reached)
 *   closing   -> sold|unsold (settled at/after closesAt: sold iff there is a
 *                             bid and it meets the reserve; unsold otherwise)
 * Returns [] when the lot is already in the right state for `now`.
 */
export function timedTransitions(lot: Lot, now: Date): LotStatus[] {
  const seq: LotStatus[] = [];
  let status = lot.status;
  const nowMs = now.getTime();
  if (status === 'scheduled' && nowMs >= Date.parse(lot.opensAt)) {
    seq.push('live');
    status = 'live';
  }
  if (status === 'live' && nowMs >= Date.parse(lot.closesAt)) {
    seq.push('closing');
    status = 'closing';
  }
  if (status === 'closing' && nowMs >= Date.parse(lot.closesAt)) {
    const reserveMet = lot.bidCount > 0 && lot.currentBidMinor >= lot.reserveMinor;
    seq.push(reserveMet ? 'sold' : 'unsold');
  }
  let prev = lot.status;
  for (const to of seq) {
    assertTransition(prev, to);
    prev = to;
  }
  return seq;
}

/** Apply a validated transition sequence, returning the updated lot. */
export function applyTransitions(lot: Lot, seq: readonly LotStatus[]): Lot {
  if (seq.length === 0) return lot;
  return { ...lot, status: seq[seq.length - 1] };
}

/**
 * Decide whether a bid is acceptable against a lot whose time-driven state
 * has already been resolved for `now`. The high bid can never move backwards:
 * acceptance always raises it by at least the increment.
 */
export function decideBid(
  lot: Lot,
  bidder: BidderIdentity,
  amountMinor: number,
  now: Date,
): BidDecision {
  if (lot.status !== 'live') {
    return { ok: false, reason: isTerminal(lot.status) ? 'lot_closed' : 'lot_not_live' };
  }
  if (now.getTime() >= Date.parse(lot.closesAt)) {
    return { ok: false, reason: 'lot_closed' };
  }
  if (!bidder.verified) {
    return { ok: false, reason: 'bidder_unverified' };
  }
  const minimum = minimumBidMinor(lot);
  if (!Number.isInteger(amountMinor) || amountMinor < minimum) {
    return { ok: false, reason: 'amount_below_minimum', minimumMinor: minimum };
  }
  const windowMs = lot.antiSnipeSeconds * 1000;
  const msLeft = Date.parse(lot.closesAt) - now.getTime();
  const extended = lot.antiSnipeSeconds > 0 && msLeft <= windowMs;
  const closesAt = extended ? new Date(now.getTime() + windowMs).toISOString() : lot.closesAt;
  return {
    ok: true,
    extended,
    patch: {
      currentBidMinor: amountMinor,
      currentBidderId: bidder.bidderId,
      bidCount: lot.bidCount + 1,
      closesAt,
    },
  };
}
