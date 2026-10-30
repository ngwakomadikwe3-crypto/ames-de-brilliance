import type { AuditEntry } from '../auction/types.ts';
import type { Bidder, BidderDocument, BidderOtp, BidderStatus } from './types.ts';

/**
 * Storage contract for bidder accounts (Phase 3a).
 *
 * Rate limiting MUST be shared storage (the Appwrite rate_limits table in
 * production) — never in-process memory — so OTP brute-force and registration
 * limits hold across serverless instances. The memory implementation exists
 * for tests and local development only.
 */
export interface BidderStore {
  createBidder(bidder: Bidder): Promise<void>;
  getBidder(id: string): Promise<Bidder | null>;
  getBidderByEmail(email: string): Promise<Bidder | null>;
  listBidders(): Promise<Bidder[]>;
  updateBidderStatus(
    id: string,
    state: { status: BidderStatus; reason: string; by: string; at: string },
  ): Promise<void>;
  updateBidderTerms(id: string, state: { version: string; at: string }): Promise<void>;
  /** Erase PII in place; the row id survives so bids/audit stay linked. */
  anonymiseBidder(id: string, at: string): Promise<void>;

  /** Upsert the OTP row for an email (new request invalidates the old code). */
  putOtp(otp: BidderOtp): Promise<void>;
  getOtp(email: string): Promise<BidderOtp | null>;
  updateOtp(email: string, patch: Partial<Pick<BidderOtp, 'attempts' | 'used'>>): Promise<void>;

  addDocument(doc: BidderDocument): Promise<void>;
  getDocument(id: string): Promise<BidderDocument | null>;
  listDocuments(bidderId: string): Promise<BidderDocument[]>;
  deleteDocument(id: string): Promise<void>;

  /** Shared-storage rate limiting; see AuctionStore.rateLimitHit. */
  rateLimitHit(key: string, windowSeconds: number, maxHits: number, now: Date): Promise<boolean>;
  appendAudit(entry: AuditEntry): Promise<void>;
}
