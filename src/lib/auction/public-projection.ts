import type { Lot } from './types.ts';

/**
 * Public API projection of an auction lot.
 *
 * Engine rows carry confidential fields that must NEVER reach a browser:
 * the reserve amount (reserveMinor) and the winning bidder identity
 * (currentBidderId). Every public route serializes lots through projectLot()
 * and nothing else — the PublicLot type below simply does not have those
 * fields, so a leak would be a compile error, not a code-review oops.
 *
 * Bid counts are public. A "reserve met" boolean is available ONLY when the
 * owner enables AUCTION_SHOW_RESERVE_MET=1 (default off); the reserve amount
 * itself is never exposed either way.
 */

export interface PublicLot {
  id: string;
  auctionId: string;
  title: string;
  description: string;
  stoneRef: string;
  currency: string;
  status: Lot['status'];
  /** First accepted bid must be >= this. Public (it is the opening ask). */
  startingBidMinor: number;
  /** Minimum increment over the current high bid. Public. */
  minIncrementMinor: number;
  antiSnipeSeconds: number;
  opensAt: string;
  closesAt: string;
  /** Current high bid; 0 when there are no bids yet. */
  currentBidMinor: number;
  bidCount: number;
  createdAt: string;
  /**
   * Present only when AUCTION_SHOW_RESERVE_MET=1. True once the current bid
   * meets the reserve. The reserve AMOUNT stays server-side regardless.
   */
  reserveMet?: boolean;
}

export interface ProjectLotOptions {
  showReserveMet: boolean;
}

export function projectLot(lot: Lot, opts: ProjectLotOptions): PublicLot {
  const projected: PublicLot = {
    id: lot.id,
    auctionId: lot.auctionId,
    title: lot.title,
    description: lot.description,
    stoneRef: lot.stoneRef,
    currency: lot.currency,
    status: lot.status,
    startingBidMinor: lot.startingBidMinor,
    minIncrementMinor: lot.minIncrementMinor,
    antiSnipeSeconds: lot.antiSnipeSeconds,
    opensAt: lot.opensAt,
    closesAt: lot.closesAt,
    currentBidMinor: lot.currentBidMinor,
    bidCount: lot.bidCount,
    createdAt: lot.createdAt,
  };
  if (opts.showReserveMet && lot.reserveMinor > 0) {
    projected.reserveMet = lot.bidCount > 0 && lot.currentBidMinor >= lot.reserveMinor;
  }
  return projected;
}

/** Minimum acceptable next bid in minor units, from public fields only. */
export function publicMinimumBidMinor(lot: PublicLot): number {
  return lot.bidCount === 0
    ? lot.startingBidMinor
    : lot.currentBidMinor + lot.minIncrementMinor;
}

/** Owner-facing feature flag (default off). Server-side env, never NEXT_PUBLIC. */
export function reserveMetVisibleFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AUCTION_SHOW_RESERVE_MET === '1';
}
