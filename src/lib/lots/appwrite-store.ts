import { ID, Query, TablesDB } from 'node-appwrite';
import { DB_ID } from '../appwrite.ts';
import { getTables } from '../buyers/appwrite-store.ts';
import type { AuditEntry } from '../buyers/types.ts';
import type { LotStore } from './store.ts';
import { DuplicateLotNoError } from './types.ts';
import type { Lot, LotComplianceDoc } from './types.ts';

/**
 * Appwrite adapter for the lot store. Lot and compliance tables are
 * server-only (permissions []), so every read/write flows through server
 * routes holding the API key. The audit trail uses the shared audit_log
 * table with the lot module's own entity/action vocabulary.
 */
export const LOT_TABLES = {
  lots: 'lots',
  compliance: 'lot_compliance',
  auditLog: 'audit_log',
} as const;

function rowToLot(r: Record<string, unknown>): Lot {
  let photoFileIds: string[] = [];
  try {
    const parsed = JSON.parse(String(r.photo_file_ids ?? '[]'));
    if (Array.isArray(parsed)) photoFileIds = parsed.map((v) => String(v));
  } catch { /* malformed JSON falls back to no photos — never throws at read time */ }
  return {
    id: String(r.$id),
    lotNo: String(r.lot_no ?? ''),
    title: String(r.title ?? ''),
    description: String(r.description ?? ''),
    origin: String(r.origin ?? ''),
    caratTotal: Number(r.carat_total ?? 0),
    stonesCount: Number(r.stones_count ?? 0),
    colour: String(r.colour ?? ''),
    clarity: String(r.clarity ?? ''),
    crystalForm: String(r.crystal_form ?? ''),
    priceMinor: Number(r.price_minor ?? 0),
    currency: String(r.currency ?? ''),
    sellerLicenceNumber: String(r.seller_licence_number ?? ''),
    sellerLicenceType: String(r.seller_licence_type ?? ''),
    sellerLicenceExpiry: String(r.seller_licence_expiry ?? ''),
    state: (r.state ?? 'draft') as Lot['state'],
    stateReason: String(r.state_reason ?? ''),
    photoFileIds,
    modelFileId: String(r.model_file_id ?? ''),
    createdBy: String(r.created_by ?? ''),
    approvedBy: String(r.approved_by ?? ''),
    approvedAt: String(r.approved_at ?? ''),
    publishedBy: String(r.published_by ?? ''),
    publishedAt: String(r.published_at ?? ''),
    createdAt: String(r.created_at ?? r.$createdAt),
    updatedAt: String(r.updated_at ?? r.$updatedAt),
  };
}

function lotToRow(lot: Lot): Record<string, unknown> {
  return {
    lot_no: lot.lotNo,
    title: lot.title,
    description: lot.description,
    origin: lot.origin,
    carat_total: lot.caratTotal,
    stones_count: lot.stonesCount,
    colour: lot.colour,
    clarity: lot.clarity,
    crystal_form: lot.crystalForm,
    price_minor: lot.priceMinor,
    currency: lot.currency,
    seller_licence_number: lot.sellerLicenceNumber,
    seller_licence_type: lot.sellerLicenceType,
    seller_licence_expiry: lot.sellerLicenceExpiry,
    state: lot.state,
    state_reason: lot.stateReason,
    photo_file_ids: JSON.stringify(lot.photoFileIds),
    model_file_id: lot.modelFileId,
    created_by: lot.createdBy,
    approved_by: lot.approvedBy,
    approved_at: lot.approvedAt || null,
    published_by: lot.publishedBy,
    published_at: lot.publishedAt || null,
    created_at: lot.createdAt,
    updated_at: lot.updatedAt,
  };
}

function rowToDoc(r: Record<string, unknown>): LotComplianceDoc {
  return {
    id: String(r.$id),
    lotId: String(r.lot_id ?? ''),
    docType: String(r.doc_type ?? 'other') as LotComplianceDoc['docType'],
    fileId: String(r.file_id ?? ''),
    filename: String(r.filename ?? ''),
    contentType: String(r.content_type ?? ''),
    size: Number(r.size ?? 0),
    sha256: String(r.sha256 ?? ''),
    notes: String(r.notes ?? ''),
    uploadedBy: String(r.uploaded_by ?? ''),
    uploadedAt: String(r.uploaded_at ?? r.$createdAt),
  };
}

function isDuplicateRow(error: unknown): boolean {
  const e = error as { code?: number; type?: string; message?: string };
  const text = `${e?.type ?? ''} ${e?.message ?? ''}`.toLowerCase();
  return e?.code === 409 || text.includes('already') || text.includes('duplicate') || text.includes('exists');
}

/** Map a Lot patch (camelCase) to row columns (snake_case). */
function patchToRow(patch: Partial<Lot>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.lotNo !== undefined) row.lot_no = patch.lotNo;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.origin !== undefined) row.origin = patch.origin;
  if (patch.caratTotal !== undefined) row.carat_total = patch.caratTotal;
  if (patch.stonesCount !== undefined) row.stones_count = patch.stonesCount;
  if (patch.colour !== undefined) row.colour = patch.colour;
  if (patch.clarity !== undefined) row.clarity = patch.clarity;
  if (patch.crystalForm !== undefined) row.crystal_form = patch.crystalForm;
  if (patch.priceMinor !== undefined) row.price_minor = patch.priceMinor;
  if (patch.currency !== undefined) row.currency = patch.currency;
  if (patch.sellerLicenceNumber !== undefined) row.seller_licence_number = patch.sellerLicenceNumber;
  if (patch.sellerLicenceType !== undefined) row.seller_licence_type = patch.sellerLicenceType;
  if (patch.sellerLicenceExpiry !== undefined) row.seller_licence_expiry = patch.sellerLicenceExpiry;
  if (patch.state !== undefined) row.state = patch.state;
  if (patch.stateReason !== undefined) row.state_reason = patch.stateReason;
  if (patch.photoFileIds !== undefined) row.photo_file_ids = JSON.stringify(patch.photoFileIds);
  if (patch.modelFileId !== undefined) row.model_file_id = patch.modelFileId;
  if (patch.approvedBy !== undefined) row.approved_by = patch.approvedBy;
  if (patch.approvedAt !== undefined) row.approved_at = patch.approvedAt || null;
  if (patch.publishedBy !== undefined) row.published_by = patch.publishedBy;
  if (patch.publishedAt !== undefined) row.published_at = patch.publishedAt || null;
  if (patch.updatedAt !== undefined) row.updated_at = patch.updatedAt;
  return row;
}

export class AppwriteLotStore implements LotStore {
  private tables: TablesDB;

  constructor(tables?: TablesDB) {
    this.tables = tables ?? getTables();
  }

  async createLot(lot: Lot): Promise<void> {
    try {
      await this.tables.createRow({
        databaseId: DB_ID,
        tableId: LOT_TABLES.lots,
        rowId: lot.id,
        data: lotToRow(lot),
      });
    } catch (error) {
      // The lots_lot_no UNIQUE index is the authoritative guard: a duplicate
      // stock reference fails the insert with a 409 even under a race.
      if (isDuplicateRow(error)) throw new DuplicateLotNoError(lot.lotNo);
      throw error;
    }
  }

  async getLot(id: string): Promise<Lot | null> {
    try {
      const row = await this.tables.getRow({ databaseId: DB_ID, tableId: LOT_TABLES.lots, rowId: id });
      return rowToLot(row as unknown as Record<string, unknown>);
    } catch (error) {
      if ((error as { code?: number })?.code === 404) return null;
      throw error;
    }
  }

  async getLotByNo(lotNo: string): Promise<Lot | null> {
    const res = await this.tables.listRows({
      databaseId: DB_ID,
      tableId: LOT_TABLES.lots,
      queries: [Query.equal('lot_no', lotNo), Query.limit(1)],
    });
    const rows = res.rows as unknown as Record<string, unknown>[];
    return rows.length > 0 ? rowToLot(rows[0]) : null;
  }

  async listLots(): Promise<Lot[]> {
    // No server-side ordering (avoid index requirements); sorted in JS —
    // the buyers queue does the same.
    const res = await this.tables.listRows({
      databaseId: DB_ID,
      tableId: LOT_TABLES.lots,
      queries: [Query.limit(500)],
    });
    const lots = (res.rows as unknown as Record<string, unknown>[]).map(rowToLot);
    lots.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return lots;
  }

  async listPublishedLots(): Promise<Lot[]> {
    const res = await this.tables.listRows({
      databaseId: DB_ID,
      tableId: LOT_TABLES.lots,
      queries: [Query.equal('state', 'published'), Query.limit(500)],
    });
    const lots = (res.rows as unknown as Record<string, unknown>[]).map(rowToLot);
    lots.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    return lots;
  }

  async updateLot(id: string, patch: Partial<Lot>): Promise<void> {
    const row = patchToRow(patch);
    if (Object.keys(row).length === 0) return;
    try {
      await this.tables.updateRow({ databaseId: DB_ID, tableId: LOT_TABLES.lots, rowId: id, data: row });
    } catch (error) {
      if (isDuplicateRow(error) && patch.lotNo !== undefined) throw new DuplicateLotNoError(patch.lotNo);
      throw error;
    }
  }

  async addComplianceDoc(doc: LotComplianceDoc): Promise<void> {
    await this.tables.createRow({
      databaseId: DB_ID,
      tableId: LOT_TABLES.compliance,
      rowId: doc.id,
      data: {
        lot_id: doc.lotId,
        doc_type: doc.docType,
        file_id: doc.fileId,
        filename: doc.filename,
        content_type: doc.contentType,
        size: doc.size,
        sha256: doc.sha256,
        notes: doc.notes,
        uploaded_by: doc.uploadedBy,
        uploaded_at: doc.uploadedAt,
      },
    });
  }

  async getComplianceDoc(id: string): Promise<LotComplianceDoc | null> {
    try {
      const row = await this.tables.getRow({ databaseId: DB_ID, tableId: LOT_TABLES.compliance, rowId: id });
      return rowToDoc(row as unknown as Record<string, unknown>);
    } catch (error) {
      if ((error as { code?: number })?.code === 404) return null;
      throw error;
    }
  }

  async listComplianceDocs(lotId: string): Promise<LotComplianceDoc[]> {
    const res = await this.tables.listRows({
      databaseId: DB_ID,
      tableId: LOT_TABLES.compliance,
      queries: [Query.equal('lot_id', lotId), Query.limit(100)],
    });
    return (res.rows as unknown as Record<string, unknown>[]).map(rowToDoc);
  }

  async deleteComplianceDoc(id: string): Promise<void> {
    try {
      await this.tables.deleteRow({ databaseId: DB_ID, tableId: LOT_TABLES.compliance, rowId: id });
    } catch (error) {
      if ((error as { code?: number })?.code !== 404) throw error;
    }
  }

  async appendAudit(entry: AuditEntry): Promise<void> {
    await this.tables.createRow({
      databaseId: DB_ID,
      tableId: LOT_TABLES.auditLog,
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
