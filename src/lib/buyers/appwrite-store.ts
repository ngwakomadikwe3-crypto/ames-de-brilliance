import { createHash } from 'node:crypto';
import { ID, Query, TablesDB } from 'node-appwrite';
import { DB_ID, getClient } from '../appwrite.ts';
import { DuplicateEmailError } from './types.ts';
import type { AuditEntry, Buyer, BuyerDocument, BuyerOtp } from './types.ts';
import type { BuyerStore } from './store.ts';

/**
 * Appwrite adapter for the buyer store.
 *
 * Rate limiting and the audit trail use the shared rate_limits / audit_log
 * tables, implemented natively here (the auction adapter is NOT used — the
 * auction engine stays disabled and must not be extended). Rate-limit
 * increments use the server's atomic incrementRowColumn with a max bound, so
 * limits hold across serverless instances. Buyer tables stay server-only
 * (permissions []), so every read/write flows through server routes holding
 * the API key.
 */
export const BUYER_TABLES = {
  buyers: 'buyers',
  otps: 'buyer_otps',
  documents: 'buyer_documents',
  auditLog: 'audit_log',
  rateLimits: 'rate_limits',
} as const;

let _tables: TablesDB | null = null;
export function getTables(): TablesDB {
  if (_tables) return _tables;
  _tables = new TablesDB(getClient());
  return _tables;
}

function rowToBuyer(r: Record<string, unknown>): Buyer {
  return {
    id: String(r.$id),
    name: String(r.name ?? ''),
    email: String(r.email ?? ''),
    phone: String(r.phone ?? ''),
    country: String(r.country ?? ''),
    entityType: (r.entity_type === 'company' ? 'company' : 'individual') as Buyer['entityType'],
    licenceNumber: String(r.licence_number ?? ''),
    licenceType: String(r.licence_type ?? ''),
    licenceExpiry: String(r.licence_expiry ?? ''),
    licenceVerifiedAt: String(r.licence_verified_at ?? ''),
    licenceVerifiedBy: String(r.licence_verified_by ?? ''),
    status: (r.status ?? 'pending') as Buyer['status'],
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

function rowToOtp(r: Record<string, unknown>): BuyerOtp {
  return {
    email: String(r.email ?? ''),
    codeHash: String(r.code_hash ?? ''),
    expiresAt: String(r.expires_at ?? ''),
    attempts: Number(r.attempts ?? 0),
    used: Boolean(r.used),
    createdAt: String(r.created_at ?? r.$createdAt),
  };
}

function rowToDocument(r: Record<string, unknown>): BuyerDocument {
  return {
    id: String(r.$id),
    buyerId: String(r.buyer_id),
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

/** Rate-limit row ids are deterministic per scope+window. */
function rateRowId(scope: string): string {
  return 'r' + createHash('sha256').update(scope).digest('hex').slice(0, 35);
}

function isDuplicateRow(error: unknown): boolean {
  const e = error as { code?: number; type?: string; message?: string };
  const text = `${e?.type ?? ''} ${e?.message ?? ''}`.toLowerCase();
  return e?.code === 409 || text.includes('already') || text.includes('duplicate') || text.includes('exists');
}

export class AppwriteBuyerStore implements BuyerStore {
  private tables: TablesDB;

  constructor(tables?: TablesDB) {
    this.tables = tables ?? getTables();
  }

  async createBuyer(buyer: Buyer): Promise<void> {
    const existing = await this.getBuyerByEmail(buyer.email);
    if (existing) throw new DuplicateEmailError(buyer.email);
    await this.tables.createRow({
      databaseId: DB_ID,
      tableId: BUYER_TABLES.buyers,
      rowId: buyer.id,
      data: {
        name: buyer.name,
        email: buyer.email,
        phone: buyer.phone,
        country: buyer.country,
        entity_type: buyer.entityType,
        licence_number: buyer.licenceNumber,
        licence_type: buyer.licenceType,
        licence_expiry: buyer.licenceExpiry,
        licence_verified_at: buyer.licenceVerifiedAt,
        licence_verified_by: buyer.licenceVerifiedBy,
        status: buyer.status,
        status_reason: buyer.statusReason,
        status_by: buyer.statusBy,
        status_at: buyer.statusAt,
        terms_version: buyer.termsVersion,
        terms_accepted_at: buyer.termsAcceptedAt,
        anonymised_at: buyer.anonymisedAt,
        created_at: buyer.createdAt,
        updated_at: buyer.updatedAt,
      },
    });
  }

  async getBuyer(id: string): Promise<Buyer | null> {
    try {
      const row = await this.tables.getRow({ databaseId: DB_ID, tableId: BUYER_TABLES.buyers, rowId: id });
      return rowToBuyer(row as unknown as Record<string, unknown>);
    } catch (error) {
      if ((error as { code?: number })?.code === 404) return null;
      throw error;
    }
  }

  async getBuyerByEmail(email: string): Promise<Buyer | null> {
    const res = await this.tables.listRows({
      databaseId: DB_ID,
      tableId: BUYER_TABLES.buyers,
      queries: [Query.equal('email', email.toLowerCase()), Query.limit(1)],
    });
    const rows = res.rows as unknown as Record<string, unknown>[];
    return rows.length > 0 ? rowToBuyer(rows[0]) : null;
  }

  async listBuyers(): Promise<Buyer[]> {
    const res = await this.tables.listRows({
      databaseId: DB_ID,
      tableId: BUYER_TABLES.buyers,
      queries: [Query.limit(200)],
    });
    return (res.rows as unknown as Record<string, unknown>[]).map(rowToBuyer);
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
    await this.tables.updateRow({
      databaseId: DB_ID,
      tableId: BUYER_TABLES.buyers,
      rowId: id,
      data: {
        status: state.status,
        status_reason: state.reason,
        status_by: state.by,
        status_at: state.at,
        licence_verified_at: state.licenceVerifiedAt,
        licence_verified_by: state.licenceVerifiedBy,
        updated_at: state.at,
      },
    });
  }

  async updateBuyerTerms(id: string, state: { version: string; at: string }): Promise<void> {
    await this.tables.updateRow({
      databaseId: DB_ID,
      tableId: BUYER_TABLES.buyers,
      rowId: id,
      data: { terms_version: state.version, terms_accepted_at: state.at, updated_at: state.at },
    });
  }

  async anonymiseBuyer(id: string, at: string): Promise<void> {
    await this.tables.updateRow({
      databaseId: DB_ID,
      tableId: BUYER_TABLES.buyers,
      rowId: id,
      data: {
        name: 'Deleted buyer',
        email: `deleted+${id}@invalid`,
        phone: '',
        country: '',
        licence_number: '',
        licence_type: '',
        licence_expiry: '',
        licence_verified_at: '',
        licence_verified_by: '',
        anonymised_at: at,
        updated_at: at,
      },
    });
  }

  async putOtp(otp: BuyerOtp): Promise<void> {
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
      await this.tables.createRow({ databaseId: DB_ID, tableId: BUYER_TABLES.otps, rowId, data });
    } catch (error) {
      if (!isDuplicateRow(error)) throw error;
      await this.tables.updateRow({ databaseId: DB_ID, tableId: BUYER_TABLES.otps, rowId, data });
    }
  }

  async getOtp(email: string): Promise<BuyerOtp | null> {
    try {
      const row = await this.tables.getRow({ databaseId: DB_ID, tableId: BUYER_TABLES.otps, rowId: otpRowId(email) });
      return rowToOtp(row as unknown as Record<string, unknown>);
    } catch (error) {
      if ((error as { code?: number })?.code === 404) return null;
      throw error;
    }
  }

  async updateOtp(email: string, patch: Partial<Pick<BuyerOtp, 'attempts' | 'used'>>): Promise<void> {
    await this.tables.updateRow({
      databaseId: DB_ID,
      tableId: BUYER_TABLES.otps,
      rowId: otpRowId(email),
      data: patch as Record<string, unknown>,
    });
  }

  async addDocument(doc: BuyerDocument): Promise<void> {
    await this.tables.createRow({
      databaseId: DB_ID,
      tableId: BUYER_TABLES.documents,
      rowId: doc.id,
      data: {
        buyer_id: doc.buyerId,
        file_id: doc.fileId,
        filename: doc.filename,
        content_type: doc.contentType,
        size: doc.size,
        sha256: doc.sha256,
        uploaded_at: doc.uploadedAt,
      },
    });
  }

  async getDocument(id: string): Promise<BuyerDocument | null> {
    try {
      const row = await this.tables.getRow({ databaseId: DB_ID, tableId: BUYER_TABLES.documents, rowId: id });
      return rowToDocument(row as unknown as Record<string, unknown>);
    } catch (error) {
      if ((error as { code?: number })?.code === 404) return null;
      throw error;
    }
  }

  async listDocuments(buyerId: string): Promise<BuyerDocument[]> {
    const res = await this.tables.listRows({
      databaseId: DB_ID,
      tableId: BUYER_TABLES.documents,
      queries: [Query.equal('buyer_id', buyerId), Query.limit(100)],
    });
    return (res.rows as unknown as Record<string, unknown>[]).map(rowToDocument);
  }

  async deleteDocument(id: string): Promise<void> {
    try {
      await this.tables.deleteRow({ databaseId: DB_ID, tableId: BUYER_TABLES.documents, rowId: id });
    } catch (error) {
      if ((error as { code?: number })?.code !== 404) throw error;
    }
  }

  /**
   * Shared-storage rate limiting: a fixed window per key, the row id
   * deterministic per window. The first hit creates the row; subsequent hits
   * use the server's atomic increment with a max bound — the increment that
   * would cross max is rejected server-side, which is exactly the hit we
   * want to deny. Holds across serverless instances.
   */
  async rateLimitHit(key: string, windowSeconds: number, maxHits: number, now: Date): Promise<boolean> {
    const windowMs = windowSeconds * 1000;
    const windowStart = Math.floor(now.getTime() / windowMs);
    const rowId = rateRowId(`${key}:${windowStart}`);
    try {
      await this.tables.createRow({
        databaseId: DB_ID,
        tableId: BUYER_TABLES.rateLimits,
        rowId,
        data: {
          key,
          window_start: windowStart,
          count: 1,
          expires_at: new Date((windowStart + 1) * windowMs).toISOString(),
        },
      });
      return true;
    } catch (error) {
      if (!isDuplicateRow(error)) throw error;
    }
    try {
      await this.tables.incrementRowColumn({
        databaseId: DB_ID,
        tableId: BUYER_TABLES.rateLimits,
        rowId,
        column: 'count',
        value: 1,
        max: maxHits,
      });
      return true;
    } catch (error) {
      const e = error as { code?: number };
      // The bound rejection surfaces as a 400/409; anything else is a real error.
      if (e?.code === 400 || e?.code === 409) return false;
      throw error;
    }
  }

  async appendAudit(entry: AuditEntry): Promise<void> {
    await this.tables.createRow({
      databaseId: DB_ID,
      tableId: BUYER_TABLES.auditLog,
      rowId: ID.unique(),
      data: {
        entity: entry.entity,
        entity_id: entry.entityId,
        action: entry.action,
        actor: entry.actor,
        detail: entry.detail,
        created_at: entry.createdAt,
      },
    });
  }
}

/** ID helper re-exported for routes that mint buyer/document ids. */
export { ID };
