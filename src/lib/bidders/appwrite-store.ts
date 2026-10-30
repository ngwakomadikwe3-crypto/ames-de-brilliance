import { createHash } from 'node:crypto';
import { ID, Query, TablesDB } from 'node-appwrite';
import { DB_ID } from '../appwrite.ts';
import { AppwriteAuctionStore, getTables } from '../auction/appwrite-store.ts';
import type { AuditEntry } from '../auction/types.ts';
import { DuplicateEmailError } from './types.ts';
import type { Bidder, BidderDocument, BidderOtp } from './types.ts';
import type { BidderStore } from './store.ts';

/**
 * Appwrite adapter for the bidder store (Phase 3a).
 *
 * Rate limiting and audit append delegate to the auction adapter — same
 * rate_limits / audit_log tables, same shared-storage guarantees. Bidder
 * tables stay server-only (permissions []), so every read/write flows through
 * server routes holding the API key.
 */
export const BIDDER_TABLES = {
  bidders: 'bidders',
  otps: 'bidder_otps',
  documents: 'bidder_documents',
} as const;

function rowToBidder(r: Record<string, unknown>): Bidder {
  return {
    id: String(r.$id),
    name: String(r.name ?? ''),
    email: String(r.email ?? ''),
    phone: String(r.phone ?? ''),
    country: String(r.country ?? ''),
    entityType: (r.entity_type === 'company' ? 'company' : 'individual') as Bidder['entityType'],
    licenceNumber: String(r.licence_number ?? ''),
    status: (r.status ?? 'pending') as Bidder['status'],
    statusReason: String(r.status_reason ?? ''),
    statusBy: String(r.status_by ?? ''),
    statusAt: String(r.status_at ?? ''),
    termsVersion: String(r.terms_version ?? ''),
    termsAcceptedAt: String(r.terms_accepted_at ?? ''),
    anonymisedAt: String(r.anonymised_at ?? ''),
    createdAt: String(r.created_at ?? r.$createdAt),
    updatedAt: String(r.updated_at ?? r.$updatedAt),
  };
}

function rowToOtp(r: Record<string, unknown>): BidderOtp {
  return {
    email: String(r.email ?? ''),
    codeHash: String(r.code_hash ?? ''),
    expiresAt: String(r.expires_at ?? ''),
    attempts: Number(r.attempts ?? 0),
    used: Boolean(r.used),
    createdAt: String(r.created_at ?? r.$createdAt),
  };
}

function rowToDocument(r: Record<string, unknown>): BidderDocument {
  return {
    id: String(r.$id),
    bidderId: String(r.bidder_id),
    fileId: String(r.file_id),
    filename: String(r.filename ?? ''),
    contentType: String(r.content_type ?? ''),
    size: Number(r.size ?? 0),
    sha256: String(r.sha256 ?? ''),
    uploadedAt: String(r.uploaded_at ?? r.$createdAt),
  };
}

/** OTP row ids are deterministic per email: a re-request replaces the row. */
function otpRowId(email: string): string {
  return 'o' + createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 35);
}

function isDuplicateRow(error: unknown): boolean {
  const e = error as { code?: number; type?: string; message?: string };
  const text = `${e?.type ?? ''} ${e?.message ?? ''}`.toLowerCase();
  return e?.code === 409 || text.includes('already') || text.includes('duplicate') || text.includes('exists');
}

export class AppwriteBidderStore implements BidderStore {
  private tables: TablesDB;
  /** Shared rate limiting + audit trail live in the auction adapter's tables. */
  private shared: AppwriteAuctionStore;

  constructor(tables?: TablesDB) {
    this.tables = tables ?? getTables();
    this.shared = new AppwriteAuctionStore(this.tables);
  }

  async createBidder(bidder: Bidder): Promise<void> {
    const existing = await this.getBidderByEmail(bidder.email);
    if (existing) throw new DuplicateEmailError(bidder.email);
    await this.tables.createRow({
      databaseId: DB_ID,
      tableId: BIDDER_TABLES.bidders,
      rowId: bidder.id,
      data: {
        name: bidder.name,
        email: bidder.email,
        phone: bidder.phone,
        country: bidder.country,
        entity_type: bidder.entityType,
        licence_number: bidder.licenceNumber,
        status: bidder.status,
        status_reason: bidder.statusReason,
        status_by: bidder.statusBy,
        status_at: bidder.statusAt,
        terms_version: bidder.termsVersion,
        terms_accepted_at: bidder.termsAcceptedAt,
        anonymised_at: bidder.anonymisedAt,
        created_at: bidder.createdAt,
        updated_at: bidder.updatedAt,
      },
    });
  }

  async getBidder(id: string): Promise<Bidder | null> {
    try {
      const row = await this.tables.getRow({ databaseId: DB_ID, tableId: BIDDER_TABLES.bidders, rowId: id });
      return rowToBidder(row as unknown as Record<string, unknown>);
    } catch (error) {
      if ((error as { code?: number })?.code === 404) return null;
      throw error;
    }
  }

  async getBidderByEmail(email: string): Promise<Bidder | null> {
    const res = await this.tables.listRows({
      databaseId: DB_ID,
      tableId: BIDDER_TABLES.bidders,
      queries: [Query.equal('email', email.toLowerCase()), Query.limit(1)],
    });
    const rows = res.rows as unknown as Record<string, unknown>[];
    return rows.length > 0 ? rowToBidder(rows[0]) : null;
  }

  async listBidders(): Promise<Bidder[]> {
    const res = await this.tables.listRows({
      databaseId: DB_ID,
      tableId: BIDDER_TABLES.bidders,
      queries: [Query.limit(200)],
    });
    return (res.rows as unknown as Record<string, unknown>[]).map(rowToBidder);
  }

  async updateBidderStatus(
    id: string,
    state: { status: Bidder['status']; reason: string; by: string; at: string },
  ): Promise<void> {
    await this.tables.updateRow({
      databaseId: DB_ID,
      tableId: BIDDER_TABLES.bidders,
      rowId: id,
      data: { status: state.status, status_reason: state.reason, status_by: state.by, status_at: state.at, updated_at: state.at },
    });
  }

  async updateBidderTerms(id: string, state: { version: string; at: string }): Promise<void> {
    await this.tables.updateRow({
      databaseId: DB_ID,
      tableId: BIDDER_TABLES.bidders,
      rowId: id,
      data: { terms_version: state.version, terms_accepted_at: state.at, updated_at: state.at },
    });
  }

  async anonymiseBidder(id: string, at: string): Promise<void> {
    await this.tables.updateRow({
      databaseId: DB_ID,
      tableId: BIDDER_TABLES.bidders,
      rowId: id,
      data: {
        name: 'Deleted bidder',
        email: `deleted+${id}@invalid`,
        phone: '',
        country: '',
        licence_number: '',
        anonymised_at: at,
        updated_at: at,
      },
    });
  }

  async putOtp(otp: BidderOtp): Promise<void> {
    const rowId = otpRowId(otp.email);
    const data = {
      email: otp.email,
      code_hash: otp.codeHash,
      expires_at: otp.expiresAt,
      attempts: otp.attempts,
      used: otp.used,
      created_at: otp.createdAt,
    };
    try {
      await this.tables.createRow({ databaseId: DB_ID, tableId: BIDDER_TABLES.otps, rowId, data });
    } catch (error) {
      if (!isDuplicateRow(error)) throw error;
      await this.tables.updateRow({ databaseId: DB_ID, tableId: BIDDER_TABLES.otps, rowId, data });
    }
  }

  async getOtp(email: string): Promise<BidderOtp | null> {
    try {
      const row = await this.tables.getRow({ databaseId: DB_ID, tableId: BIDDER_TABLES.otps, rowId: otpRowId(email) });
      return rowToOtp(row as unknown as Record<string, unknown>);
    } catch (error) {
      if ((error as { code?: number })?.code === 404) return null;
      throw error;
    }
  }

  async updateOtp(email: string, patch: Partial<Pick<BidderOtp, 'attempts' | 'used'>>): Promise<void> {
    await this.tables.updateRow({
      databaseId: DB_ID,
      tableId: BIDDER_TABLES.otps,
      rowId: otpRowId(email),
      data: patch as Record<string, unknown>,
    });
  }

  async addDocument(doc: BidderDocument): Promise<void> {
    await this.tables.createRow({
      databaseId: DB_ID,
      tableId: BIDDER_TABLES.documents,
      rowId: doc.id,
      data: {
        bidder_id: doc.bidderId,
        file_id: doc.fileId,
        filename: doc.filename,
        content_type: doc.contentType,
        size: doc.size,
        sha256: doc.sha256,
        uploaded_at: doc.uploadedAt,
      },
    });
  }

  async getDocument(id: string): Promise<BidderDocument | null> {
    try {
      const row = await this.tables.getRow({ databaseId: DB_ID, tableId: BIDDER_TABLES.documents, rowId: id });
      return rowToDocument(row as unknown as Record<string, unknown>);
    } catch (error) {
      if ((error as { code?: number })?.code === 404) return null;
      throw error;
    }
  }

  async listDocuments(bidderId: string): Promise<BidderDocument[]> {
    const res = await this.tables.listRows({
      databaseId: DB_ID,
      tableId: BIDDER_TABLES.documents,
      queries: [Query.equal('bidder_id', bidderId), Query.limit(100)],
    });
    return (res.rows as unknown as Record<string, unknown>[]).map(rowToDocument);
  }

  async deleteDocument(id: string): Promise<void> {
    try {
      await this.tables.deleteRow({ databaseId: DB_ID, tableId: BIDDER_TABLES.documents, rowId: id });
    } catch (error) {
      if ((error as { code?: number })?.code !== 404) throw error;
    }
  }

  async rateLimitHit(key: string, windowSeconds: number, maxHits: number, now: Date): Promise<boolean> {
    return this.shared.rateLimitHit(key, windowSeconds, maxHits, now);
  }

  async appendAudit(entry: AuditEntry): Promise<void> {
    return this.shared.appendAudit(entry);
  }
}

/** ID helper re-exported for routes that mint bidder/document ids. */
export { ID };
