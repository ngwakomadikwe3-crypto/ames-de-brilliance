import type { AuditEntry } from './types.ts';
import { DuplicateEmailError } from './types.ts';
import type { Buyer, BuyerDocument, BuyerOtp } from './types.ts';
import type { BuyerStore } from './store.ts';

/**
 * In-memory BuyerStore for unit tests and local development.
 * NOT for production: state is per-process, and rate limiting here is
 * per-process too — the Appwrite adapter provides the shared-store semantics
 * the contract requires.
 */
export class MemoryBuyerStore implements BuyerStore {
  private buyers = new Map<string, Buyer>();
  private otps = new Map<string, BuyerOtp>();
  private documents = new Map<string, BuyerDocument>();
  private audits: AuditEntry[] = [];
  private rateWindows = new Map<string, { count: number; expiresMs: number }>();

  auditTrail(): AuditEntry[] {
    return [...this.audits];
  }

  async createBuyer(buyer: Buyer): Promise<void> {
    const existing = [...this.buyers.values()].find((b) => b.email === buyer.email);
    if (existing) throw new DuplicateEmailError(buyer.email);
    this.buyers.set(buyer.id, { ...buyer });
  }

  async getBuyer(id: string): Promise<Buyer | null> {
    const b = this.buyers.get(id);
    return b ? { ...b } : null;
  }

  async getBuyerByEmail(email: string): Promise<Buyer | null> {
    const b = [...this.buyers.values()].find((x) => x.email === email.toLowerCase());
    return b ? { ...b } : null;
  }

  async listBuyers(): Promise<Buyer[]> {
    return [...this.buyers.values()].map((b) => ({ ...b }));
  }

  async updateBuyerStatus(
    id: string,
    state: {
      status: Buyer['status'];
      reason: string;
      by: string;
      at: string;
      licenceVerifiedAt: string;
      licenceVerifiedBy: string;
    },
  ): Promise<void> {
    const b = this.buyers.get(id);
    if (!b) return;
    this.buyers.set(id, {
      ...b,
      status: state.status,
      statusReason: state.reason,
      statusBy: state.by,
      statusAt: state.at,
      licenceVerifiedAt: state.licenceVerifiedAt,
      licenceVerifiedBy: state.licenceVerifiedBy,
      updatedAt: state.at,
    });
  }

  async updateBuyerTerms(id: string, state: { version: string; at: string }): Promise<void> {
    const b = this.buyers.get(id);
    if (!b) return;
    this.buyers.set(id, { ...b, termsVersion: state.version, termsAcceptedAt: state.at, updatedAt: state.at });
  }

  async anonymiseBuyer(id: string, at: string): Promise<void> {
    const b = this.buyers.get(id);
    if (!b) return;
    this.buyers.set(id, {
      ...b,
      name: 'Deleted buyer',
      email: `deleted+${id}@invalid`,
      phone: '',
      country: '',
      licenceNumber: '',
      licenceType: '',
      licenceExpiry: '',
      licenceVerifiedAt: '',
      licenceVerifiedBy: '',
      anonymisedAt: at,
      updatedAt: at,
    });
  }

  async putOtp(otp: BuyerOtp): Promise<void> {
    this.otps.set(otp.email, { ...otp });
  }

  async getOtp(email: string): Promise<BuyerOtp | null> {
    const o = this.otps.get(email.toLowerCase());
    return o ? { ...o } : null;
  }

  async updateOtp(email: string, patch: Partial<Pick<BuyerOtp, 'attempts' | 'used'>>): Promise<void> {
    const o = this.otps.get(email.toLowerCase());
    if (!o) return;
    this.otps.set(o.email, { ...o, ...patch });
  }

  async addDocument(doc: BuyerDocument): Promise<void> {
    this.documents.set(doc.id, { ...doc });
  }

  async getDocument(id: string): Promise<BuyerDocument | null> {
    const d = this.documents.get(id);
    return d ? { ...d } : null;
  }

  async listDocuments(buyerId: string): Promise<BuyerDocument[]> {
    return [...this.documents.values()].filter((d) => d.buyerId === buyerId).map((d) => ({ ...d }));
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
