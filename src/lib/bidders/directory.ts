import { createHmac } from 'node:crypto';
import type { BidderDocumentRecord, BidderOtpRecord, BidderRecord, BidderStatus, EntityType } from './types.ts';

/**
 * Bidder directory: storage-independent access to bidder, OTP and document
 * records. Production uses AppwriteBidderDirectory; tests use
 * MemoryBidderDirectory.
 */

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Pseudonymous deterministic bidder id for an email (see types.ts). */
export function bidderIdForEmail(email: string, secret: string): string {
  const hex = createHmac('sha256', secret).update('bidder:' + normalizeEmail(email)).digest('hex');
  return 'b' + hex.slice(0, 34);
}

/** Deterministic OTP row id: one live OTP row per email. */
export function otpIdForEmail(email: string, secret: string): string {
  const hex = createHmac('sha256', secret).update('otp:' + normalizeEmail(email)).digest('hex');
  return 'o' + hex.slice(0, 34);
}

export interface NewBidderInput {
  name: string;
  email: string;
  phone: string;
  country: string;
  entityType: EntityType;
  licenceNumber: string;
}

export interface BidderDirectory {
  /**
   * Create a bidder in 'pending'. The deterministic id makes this idempotent:
   * returns { created: false, bidder: existing } when the email is registered.
   */
  createBidder(input: NewBidderInput, now: Date): Promise<{ created: boolean; bidder: BidderRecord }>;
  getBidder(id: string): Promise<BidderRecord | null>;
  getBidderByEmail(email: string): Promise<BidderRecord | null>;
  listBidders(status?: BidderStatus): Promise<BidderRecord[]>;
  setBidderStatus(id: string, state: { status: BidderStatus; reason: string; at: string }): Promise<void>;
  setBidderTerms(id: string, state: { version: string; at: string }): Promise<void>;
  /** Tombstone PII fields. The row (and its pseudonymous id) stays: bids and audit reference it. */
  anonymiseBidder(id: string, state: { at: string; tombstoneEmail: string }): Promise<void>;

  /** Upsert the single live OTP row for an email. */
  putOtp(email: string, otp: { codeHash: string; expiresAt: string }, now: Date): Promise<void>;
  getOtp(email: string): Promise<BidderOtpRecord | null>;
  markOtpUsed(email: string, at: string): Promise<void>;

  addDocument(doc: BidderDocumentRecord): Promise<void>;
  getDocument(docId: string): Promise<BidderDocumentRecord | null>;
  listDocuments(bidderId: string): Promise<BidderDocumentRecord[]>;
  deleteDocument(docId: string): Promise<void>;
}

/** In-memory directory for unit tests (never used in production). */
export class MemoryBidderDirectory implements BidderDirectory {
  private bidders = new Map<string, BidderRecord>();
  private otps = new Map<string, BidderOtpRecord>();
  private docs = new Map<string, BidderDocumentRecord>();
  private secret: string;

  constructor(secret: string) {
    this.secret = secret;
  }

  async createBidder(input: NewBidderInput, now: Date): Promise<{ created: boolean; bidder: BidderRecord }> {
    const id = bidderIdForEmail(input.email, this.secret);
    const existing = this.bidders.get(id);
    if (existing) return { created: false, bidder: { ...existing } };
    const bidder: BidderRecord = {
      id,
      name: input.name,
      email: normalizeEmail(input.email),
      phone: input.phone,
      country: input.country,
      entityType: input.entityType,
      licenceNumber: input.licenceNumber,
      status: 'pending',
      statusReason: '',
      termsVersion: '',
      termsAcceptedAt: '',
      anonymisedAt: '',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.bidders.set(id, bidder);
    return { created: true, bidder: { ...bidder } };
  }

  async getBidder(id: string): Promise<BidderRecord | null> {
    const b = this.bidders.get(id);
    return b ? { ...b } : null;
  }

  async getBidderByEmail(email: string): Promise<BidderRecord | null> {
    return this.getBidder(bidderIdForEmail(email, this.secret));
  }

  async listBidders(status?: BidderStatus): Promise<BidderRecord[]> {
    return [...this.bidders.values()]
      .filter((b) => !status || b.status === status)
      .map((b) => ({ ...b }));
  }

  async setBidderStatus(id: string, state: { status: BidderStatus; reason: string; at: string }): Promise<void> {
    const b = this.bidders.get(id);
    if (!b) return;
    this.bidders.set(id, { ...b, status: state.status, statusReason: state.reason, updatedAt: state.at });
  }

  async setBidderTerms(id: string, state: { version: string; at: string }): Promise<void> {
    const b = this.bidders.get(id);
    if (!b) return;
    this.bidders.set(id, { ...b, termsVersion: state.version, termsAcceptedAt: state.at, updatedAt: state.at });
  }

  async anonymiseBidder(id: string, state: { at: string; tombstoneEmail: string }): Promise<void> {
    const b = this.bidders.get(id);
    if (!b) return;
    this.bidders.set(id, {
      ...b,
      name: 'Anonymised bidder',
      email: state.tombstoneEmail,
      phone: '',
      country: '',
      licenceNumber: '',
      anonymisedAt: state.at,
      updatedAt: state.at,
    });
  }

  async putOtp(email: string, otp: { codeHash: string; expiresAt: string }, now: Date): Promise<void> {
    this.otps.set(normalizeEmail(email), {
      id: otpIdForEmail(email, this.secret),
      email: normalizeEmail(email),
      codeHash: otp.codeHash,
      expiresAt: otp.expiresAt,
      usedAt: '',
      createdAt: now.toISOString(),
    });
  }

  async getOtp(email: string): Promise<BidderOtpRecord | null> {
    const o = this.otps.get(normalizeEmail(email));
    return o ? { ...o } : null;
  }

  async markOtpUsed(email: string, at: string): Promise<void> {
    const o = this.otps.get(normalizeEmail(email));
    if (o) this.otps.set(normalizeEmail(email), { ...o, usedAt: at });
  }

  async addDocument(doc: BidderDocumentRecord): Promise<void> {
    this.docs.set(doc.id, { ...doc });
  }

  async getDocument(docId: string): Promise<BidderDocumentRecord | null> {
    const d = this.docs.get(docId);
    return d ? { ...d } : null;
  }

  async listDocuments(bidderId: string): Promise<BidderDocumentRecord[]> {
    return [...this.docs.values()].filter((d) => d.bidderId === bidderId).map((d) => ({ ...d }));
  }

  async deleteDocument(docId: string): Promise<void> {
    this.docs.delete(docId);
  }
}
