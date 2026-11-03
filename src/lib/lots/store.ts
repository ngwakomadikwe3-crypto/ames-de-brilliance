import type { AuditEntry } from '../buyers/types.ts';
import type { Lot, LotComplianceDoc } from './types.ts';

/**
 * Storage contract for rough lots and their compliance records.
 *
 * The Appwrite adapter is the production implementation (server-only tables,
 * every read/write through server routes holding the API key). The memory
 * implementation exists for tests and local development only.
 */
export interface LotStore {
  createLot(lot: Lot): Promise<void>;
  getLot(id: string): Promise<Lot | null>;
  getLotByNo(lotNo: string): Promise<Lot | null>;
  /** All lots, any state — the staff management view. */
  listLots(): Promise<Lot[]>;
  /** Published lots only — the catalogue view. */
  listPublishedLots(): Promise<Lot[]>;
  /**
   * Apply a field patch. The service layer computes the patch (including any
   * state demotion under amendment 6); the store applies it verbatim.
   */
  updateLot(id: string, patch: Partial<Lot>): Promise<void>;

  addComplianceDoc(doc: LotComplianceDoc): Promise<void>;
  getComplianceDoc(id: string): Promise<LotComplianceDoc | null>;
  listComplianceDocs(lotId: string): Promise<LotComplianceDoc[]>;
  deleteComplianceDoc(id: string): Promise<void>;

  appendAudit(entry: AuditEntry): Promise<void>;
}
