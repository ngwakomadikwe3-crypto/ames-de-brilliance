import { ID, Query } from 'node-appwrite';
import { DB_ID } from '../appwrite.ts';
import { getTables } from '../auction/appwrite-store.ts';
import { bidderIdForEmail, normalizeEmail, otpIdForEmail } from './directory.ts';
import type { BidderDirectory, NewBidderInput } from './directory.ts';
import type { BidderDocumentRecord, BidderOtpRecord, BidderRecord, BidderStatus } from './types.ts';

/**
 * Appwrite adapter for the bidder directory. Collections are server-only
 * (no client permissions); every access flows through server routes holding
 * the API key. Row ids are the keyed hashes from directory.ts, which makes
 * registration and OTP reissue atomically idempotent via 409 collisions.
 */

export const BIDDER_TABLES = {
  bidders: 'bidders',
  otps: 'bidder_otps',
  documents: 'bidder_documents',
} as const;

function requireSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set to a value of at least 32 characters.');
  }
  return secret;
}

function rowToBidder(r: Record<string, unknown>): BidderRecord {
  return {
    id: String(r.$id),
    name: String(r.name ?? ''),
    email: String(r.email ?? ''),
    phone: String(r.phone ?? ''),
    country: String(r.country ?? ''),
    entityType: (r.entity_type === 'company' ? 'company' : 'individual') as BidderRecord['entityType'],
    licenceNumber: String(r.licence_number ?? ''),
    status: (['pending', 'verified', 'rejected', 'suspended'].includes(String(r.status)) ? r.status : 'pending') as BidderStatus,
    statusReason: String(r.status_reason ?? ''),
    termsVersion: String(r.terms_version ?? ''),
    termsAcceptedAt: r.terms_accepted_at ? String(r.terms_accepted_at) : '',
    anonymisedAt: r.anonymised_at ? String(r.anonymised_at) : '',
    createdAt: String(r.created_at ?? r.$createdAt),
    updatedAt: String(r.updated_at ?? r.$updatedAt),
  };
}

function rowToDocument(r: Record<string, unknown>): BidderDocumentRecord {
  return {
    id: String(r.$id),
    bidderId: String(r.bidder_id),
    fileId: String(r.file_id),
    fileName: String(r.file_name ?? ''),
    contentType: String(r.content_type ?? ''),
    sizeBytes: Number(r.size_bytes ?? 0),
    createdAt: String(r.created_at ?? r.$createdAt),
  };
}

function rowToOtp(r: Record<string, unknown>): BidderOtpRecord {
  return {
    id: String(r.$id),
    email: String(r.email ?? ''),
    codeHash: String(r.code_hash),
    expiresAt: String(r.expires_at),
    usedAt: r.used_at ? String(r.used_at) : '',
    createdAt: String(r.created_at ?? r.$createdAt),
  };
}

export class AppwriteBidderDirectory implements BidderDirectory {
  private tables = getTables();

  async createBidder(input: NewBidderInput, now: Date): Promise<{ created: boolean; bidder: BidderRecord }> {
    const email = normalizeEmail(input.email);
    const id = bidderIdForEmail(email, requireSecret());
    const data = {
      name: input.name,
      email,
      phone: input.phone,
      country: input.country,
      entity_type: input.entityType,
      licence_number: input.licenceNumber,
      status: 'pending',
      status_reason: '',
      terms_version: '',
      verified: false,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    try {
      const row = await this.tables.createRow({ databaseId: DB_ID, tableId: BIDDER_TABLES.bidders, rowId: id, data });
      return { created: true, bidder: rowToBidder(row as unknown as Record<string, unknown>) };
    } catch (error) {
      if ((error as { code?: number })?.code !== 409) throw error;
      const existing = await this.getBidder(id);
      if (!existing) throw error;
      return { created: false, bidder: existing };
    }
  }

  async getBidder(id: string): Promise<BidderRecord | null> {
    try {
      const row = await this.tables.getRow({ databaseId: DB_ID, tableId: BIDDER_TABLES.bidders, rowId: id });
      return rowToBidder(row as unknown as Record<string, unknown>);
    } catch (error) {
      if ((error as { code?: number })?.code === 404) return null;
      throw error;
    }
  }

  async getBidderByEmail(email: string): Promise<BidderRecord | null> {
    return this.getBidder(bidderIdForEmail(email, requireSecret()));
  }

  async listBidders(status?: BidderStatus): Promise<BidderRecord[]> {
    const res = await this.tables.listRows({
      databaseId: DB_ID,
      tableId: BIDDER_TABLES.bidders,
      queries: status
        ? [Query.equal('status', status), Query.orderDesc('created_at'), Query.limit(200)]
        : [Query.orderDesc('created_at'), Query.limit(200)],
    });
    return (res.rows as unknown as Record<string, unknown>[]).map(rowToBidder);
  }

  async setBidderStatus(id: string, state: { status: BidderStatus; reason: string; at: string }): Promise<void> {
    await this.tables.updateRow({
      databaseId: DB_ID,
      tableId: BIDDER_TABLES.bidders,
      rowId: id,
      data: {
        status: state.status,
        status_reason: state.reason,
        verified: state.status === 'verified',
        updated_at: state.at,
      },
    });
  }

  async setBidderTerms(id: string, state: { version: string; at: string }): Promise<void> {
    await this.tables.updateRow({
      databaseId: DB_ID,
      tableId: BIDDER_TABLES.bidders,
      rowId: id,
      data: { terms_version: state.version, terms_accepted_at: state.at, updated_at: state.at },
    });
  }

  async anonymiseBidder(id: string, state: { at: string; tombstoneEmail: string }): Promise<void> {
    await this.tables.updateRow({
      databaseId: DB_ID,
      tableId: BIDDER_TABLES.bidders,
      rowId: id,
      data: {
        name: 'Anonymised bidder',
        email: state.tombstoneEmail,
        phone: '',
        country: '',
        licence_number: '',
        anonymised_at: state.at,
        updated_at: state.at,
      },
    });
  }

  async putOtp(email: string, otp: { codeHash: string; expiresAt: string }, now: Date): Promise<void> {
    const normalized = normalizeEmail(email);
    const rowId = otpIdForEmail(normalized, requireSecret());
    const data = {
      email: normalized,
      code_hash: otp.codeHash,
      expires_at: otp.expiresAt,
      used_at: null,
      created_at: now.toISOString(),
    };
    try {
      await this.tables.createRow({ databaseId: DB_ID, tableId: BIDDER_TABLES.otps, rowId, data });
    } catch (error) {
      if ((error as { code?: number })?.code !== 409) throw error;
      await this.tables.updateRow({ databaseId: DB_ID, tableId: BIDDER_TABLES.otps, rowId, data });
    }
  }

  async getOtp(email: string): Promise<BidderOtpRecord | null> {
    try {
      const row = await this.tables.getRow({
        databaseId: DB_ID,
        tableId: BIDDER_TABLES.otps,
        rowId: otpIdForEmail(email, requireSecret()),
      });
      return rowToOtp(row as unknown as Record<string, unknown>);
    } catch (error) {
      if ((error as { code?: number })?.code === 404) return null;
      throw error;
    }
  }

  async markOtpUsed(email: string, at: string): Promise<void> {
    await this.tables.updateRow({
      databaseId: DB_ID,
      tableId: BIDDER_TABLES.otps,
      rowId: otpIdForEmail(email, requireSecret()),
      data: { used_at: at },
    });
  }

  async addDocument(doc: BidderDocumentRecord): Promise<void> {
    await this.tables.createRow({
      databaseId: DB_ID,
      tableId: BIDDER_TABLES.documents,
      rowId: doc.id,
      data: {
        bidder_id: doc.bidderId,
        file_id: doc.fileId,
        file_name: doc.fileName,
        content_type: doc.contentType,
        size_bytes: doc.sizeBytes,
        created_at: doc.createdAt,
      },
    });
  }

  async getDocument(docId: string): Promise<BidderDocumentRecord | null> {
    try {
      const row = await this.tables.getRow({ databaseId: DB_ID, tableId: BIDDER_TABLES.documents, rowId: docId });
      return rowToDocument(row as unknown as Record<string, unknown>);
    } catch (error) {
      if ((error as { code?: number })?.code === 404) return null;
      throw error;
    }
  }

  async listDocuments(bidderId: string): Promise<BidderDocumentRecord[]> {
    const res = await this.tables.listRows({
      databaseId: DB_ID,
      tableId: BIDDER_TABLES.documents,
      queries: [Query.equal('bidder_id', bidderId), Query.limit(100)],
    });
    return (res.rows as unknown as Record<string, unknown>[]).map(rowToDocument);
  }

  async deleteDocument(docId: string): Promise<void> {
    await this.tables.deleteRow({ databaseId: DB_ID, tableId: BIDDER_TABLES.documents, rowId: docId });
  }
}

/** New document row id (33 chars, Appwrite-safe). */
export function newDocumentId(): string {
  return 'd' + ID.unique().replace(/-/g, '').slice(0, 32);
}
