import type { AuditEntry } from '../auction/types.ts';
import { DuplicateEmailError } from './types.ts';
import type { Bidder, BidderDocument, BidderOtp } from './types.ts';
import type { BidderStore } from './store.ts';

/**
 * In-memory BidderStore for unit tests and local development.
 * NOT for production: state is per-process, and rate limiting here is
 * per-process too — the Appwrite adapter provides the shared-store semantics
 * the contract requires.
 */
export class MemoryBidderStore implements BidderStore {
  private bidders = new Map<string, Bidder>();
  private otps = new Map<string, BidderOtp>();
  private documents = new Map<string, BidderDocument>();
  private audits: AuditEntry[] = [];
  private rateWindows = new Map<string, { count: number; expiresMs: number }>();

  auditTrail(): AuditEntry[] {
    return [...this.audits];
  }

  async createBidder(bidder: Bidder): Promise<void> {
    const existing = [...this.bidders.values()].find((b) => b.email === bidder.email);
    if (existing) throw new DuplicateEmailError(bidder.email);
    this.bidders.set(bidder.id, { ...bidder });
  }

  async getBidder(id: string): Promise<Bidder | null> {
    const b = this.bidders.get(id);
    return b ? { ...b } : null;
  }

  async getBidderByEmail(email: string): Promise<Bidder | null> {
    const b = [...this.bidders.values()].find((x) => x.email === email.toLowerCase());
    return b ? { ...b } : null;
  }

  async listBidders(): Promise<Bidder[]> {
    return [...this.bidders.values()].map((b) => ({ ...b }));
  }

  async updateBidderStatus(
    id: string,
    state: { status: Bidder['status']; reason: string; by: string; at: string },
  ): Promise<void> {
    const b = this.bidders.get(id);
    if (!b) return;
    this.bidders.set(id, {
      ...b,
      status: state.status,
      statusReason: state.reason,
      statusBy: state.by,
      statusAt: state.at,
      updatedAt: state.at,
    });
  }

  async updateBidderTerms(id: string, state: { version: string; at: string }): Promise<void> {
    const b = this.bidders.get(id);
    if (!b) return;
    this.bidders.set(id, { ...b, termsVersion: state.version, termsAcceptedAt: state.at, updatedAt: state.at });
  }

  async anonymiseBidder(id: string, at: string): Promise<void> {
    const b = this.bidders.get(id);
    if (!b) return;
    this.bidders.set(id, {
      ...b,
      name: 'Deleted bidder',
      email: `deleted+${id}@invalid`,
      phone: '',
      country: '',
      licenceNumber: '',
      anonymisedAt: at,
      updatedAt: at,
    });
  }

  async putOtp(otp: BidderOtp): Promise<void> {
    this.otps.set(otp.email, { ...otp });
  }

  async getOtp(email: string): Promise<BidderOtp | null> {
    const o = this.otps.get(email.toLowerCase());
    return o ? { ...o } : null;
  }

  async updateOtp(email: string, patch: Partial<Pick<BidderOtp, 'attempts' | 'used'>>): Promise<void> {
    const o = this.otps.get(email.toLowerCase());
    if (!o) return;
    this.otps.set(o.email, { ...o, ...patch });
  }

  async addDocument(doc: BidderDocument): Promise<void> {
    this.documents.set(doc.id, { ...doc });
  }

  async getDocument(id: string): Promise<BidderDocument | null> {
    const d = this.documents.get(id);
    return d ? { ...d } : null;
  }

  async listDocuments(bidderId: string): Promise<BidderDocument[]> {
    return [...this.documents.values()].filter((d) => d.bidderId === bidderId).map((d) => ({ ...d }));
  }

  async deleteDocument(id: string): Promise<void> {
    this.documents.delete(id);
  }

  async rateLimitHit(key: string, windowSeconds: number, maxHits: number, now: Date): Promise<boolean> {
    const windowMs = windowSeconds * 1000;
    const windowStart = Math.floor(now.getTime() / windowMs);
    const k = `${key}:${windowStart}`;
    const current = this.rateWindows.get(k);
    if (!current || current.expiresMs <= now.getTime()) {
      this.rateWindows.set(k, { count: 1, expiresMs: (windowStart + 1) * windowMs });
      return true;
    }
    if (current.count >= maxHits) return false;
    current.count += 1;
    return true;
  }

  async appendAudit(entry: AuditEntry): Promise<void> {
    this.audits.push({ ...entry });
  }
}
