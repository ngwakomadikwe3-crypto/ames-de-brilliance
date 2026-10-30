/**
 * AMES auction data model — Phase 2a.
 *
 * Money is ALWAYS integer minor units plus an ISO 4217 currency code.
 * No floats anywhere in the auction path.
 */

export const LOT_STATUSES = [
  'draft',
  'scheduled',
  'live',
  'closing',
  'sold',
  'unsold',
  'withdrawn',
] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];

export interface Lot {
  id: string;
  auctionId: string;
  title: string;
  description: string;
  stoneRef: string;
  /** ISO 4217 currency code, e.g. "BWP" or "USD". */
  currency: string;
  status: LotStatus;
  /** First accepted bid must be >= this (integer minor units). */
  startingBidMinor: number;
  /** Reserve price in minor units; 0 means "no reserve". */
  reserveMinor: number;
  /** Minimum increment over the current high bid (integer minor units). */
  minIncrementMinor: number;
  /** Anti-snipe window in seconds; a bid inside the window extends closesAt. 0 disables. */
  antiSnipeSeconds: number;
  /** ISO-8601 UTC. Lot transitions scheduled -> live at this instant (lazy). */
  opensAt: string;
  /** ISO-8601 UTC. Lot transitions live -> closing -> sold|unsold at/after this instant (lazy). */
  closesAt: string;
  /** Current high bid in minor units; 0 when there are no bids. */
  currentBidMinor: number;
  /** Bidder id of the current high bid; '' when there are no bids. */
  currentBidderId: string;
  bidCount: number;
  createdAt: string;
  /**
   * Close-notification bookkeeping (Phase 2b sweeper). '' until the sweeper
   * has emailed winner + house; 'sent' or 'failed' afterwards. Optional so
   * lots provisioned before the columns existed keep deserializing.
   */
  closeNotifyStatus?: '' | 'sent' | 'failed';
  closeNotifyError?: string;
  closeNotifiedAt?: string;
}

export interface Bid {
  /** Deterministic row id derived from the idempotency key. */
  id: string;
  lotId: string;
  bidderId: string;
  /** Integer minor units. */
  amountMinor: number;
  currency: string;
  /** Client-supplied idempotency key (stored for audit; uniqueness enforced via id). */
  idempotencyKey: string;
  createdAt: string;
}

export interface BidderIdentity {
  bidderId: string;
  verified: boolean;
  /**
   * Which resolver produced this identity: 'staff-session-stub' (house
   * session, always bid-capable) or 'bidder-account' (Phase 3a real account,
   * subject to the public-bidding flag and the terms gate).
   */
  via: string;
  /** Terms version accepted by the bidder ('' = never). Staff stub omits it. */
  termsVersion?: string;
}

export type AuditEntity = 'lot' | 'bid' | 'bidder';

export const AUDIT_ACTIONS = [
  'bid.accepted',
  'bid.rejected',
  'bid.rate_limited',
  'lot.extended',
  'lot.transition',
  'lot.close_notified',
  'lot.close_notify_failed',
  'bidder.registered',
  'bidder.login',
  'bidder.terms_accepted',
  'bidder.approved',
  'bidder.rejected',
  'bidder.suspended',
  'bidder.reinstated',
  'bidder.doc_uploaded',
  'bidder.doc_viewed',
  'bidder.exported',
  'bidder.anonymised',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  entity: AuditEntity;
  entityId: string;
  action: AuditAction;
  /** Who performed/requested the action; 'system' for time-driven transitions. */
  actor: string;
  /** JSON string with structured detail. */
  detail: string;
  createdAt: string;
}
