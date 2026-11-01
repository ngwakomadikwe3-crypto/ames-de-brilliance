import type { AuditEntry } from './types.ts';
import type { Buyer, BuyerDocument, BuyerOtp, BuyerStatus } from './types.ts';

/**
 * Storage contract for buyer accounts.
 *
 * Rate limiting MUST be shared storage (the Appwrite rate_limits table in
 * production) — never in-process memory — so OTP brute-force and registration
 * limits hold across serverless instances. The memory implementation exists
 * for tests and local development only.
 */
export interface BuyerStore {
  createBuyer(buyer: Buyer): Promise<void>;
  getBuyer(id: string): Promise<Buyer | null>;
  getBuyerByEmail(email: string): Promise<Buyer | null>;
  listBuyers(): Promise<Buyer[]>;
  updateBuyerStatus(
    id: string,
    state: {
      status: BuyerStatus;
      reason: string;
      by: string;
      at: string;
      /** Licence verification stamp — set on approve, cleared otherwise. */
      licenceVerifiedAt: string;
      licenceVerifiedBy: string;
    },
  ): Promise<void>;
  updateBuyerTerms(id: string, state: { version: string; at: string }): Promise<void>;
  /** Erase PII in place; the row id survives so offers/deals and audit stay linked. */
  anonymiseBuyer(id: string, at: string): Promise<void>;

  /** Upsert the OTP row for an email (new request invalidates the old code). */
  putOtp(otp: BuyerOtp): Promise<void>;
  getOtp(email: string): Promise<BuyerOtp | null>;
  updateOtp(email: string, patch: Partial<Pick<BuyerOtp, 'attempts' | 'used'>>): Promise<void>;

  addDocument(doc: BuyerDocument): Promise<void>;
  getDocument(id: string): Promise<BuyerDocument | null>;
  listDocuments(buyerId: string): Promise<BuyerDocument[]>;
  deleteDocument(id: string): Promise<void>;

  /** Shared-storage rate limiting; holds across serverless instances. */
  rateLimitHit(key: string, windowSeconds: number, maxHits: number, now: Date): Promise<boolean>;
  appendAudit(entry: AuditEntry): Promise<void>;
}
