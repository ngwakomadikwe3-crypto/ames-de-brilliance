import type { AuditEntry } from '../buyers/types.ts';
import type { LotStore } from './store.ts';
import { DuplicateLotNoError } from './types.ts';
import type { Lot, LotComplianceDoc } from './types.ts';

/**
 * In-memory LotStore for unit tests and local development.
 * NOT for production: state is per-process.
 */
export class MemoryLotStore implements LotStore {
  private lots = new Map<string, Lot>();
  private docs = new Map<string, LotComplianceDoc>();
  private audits: AuditEntry[] = [];

  auditTrail(): AuditEntry[] {
    return [...this.audits];
  }

  async createLot(lot: Lot): Promise<void> {
    const existing = [...this.lots.values()].find((l) => l.lotNo === lot.lotNo);
    if (existing) throw new DuplicateLotNoError(lot.lotNo);
    this.lots.set(lot.id, { ...lot, photoFileIds: [...lot.photoFileIds] });
  }

  async getLot(id: string): Promise<Lot | null> {
    const l = this.lots.get(id);
    return l ? { ...l, photoFileIds: [...l.photoFileIds] } : null;
  }

  async getLotByNo(lotNo: string): Promise<Lot | null> {
    const l = [...this.lots.values()].find((x) => x.lotNo === lotNo);
    return l ? { ...l, photoFileIds: [...l.photoFileIds] } : null;
  }

  async listLots(): Promise<Lot[]> {
    return [...this.lots.values()].map((l) => ({ ...l, photoFileIds: [...l.photoFileIds] }));
  }

  async listPublishedLots(): Promise<Lot[]> {
    return [...this.lots.values()]
      .filter((l) => l.state === 'published')
      .map((l) => ({ ...l, photoFileIds: [...l.photoFileIds] }));
  }

  async updateLot(id: string, patch: Partial<Lot>): Promise<void> {
    const l = this.lots.get(id);
    if (!l) return;
    this.lots.set(id, {
      ...l,
      ...patch,
      photoFileIds: patch.photoFileIds ? [...patch.photoFileIds] : [...l.photoFileIds],
    });
  }

  async addComplianceDoc(doc: LotComplianceDoc): Promise<void> {
    this.docs.set(doc.id, { ...doc });
  }

  async getComplianceDoc(id: string): Promise<LotComplianceDoc | null> {
    const d = this.docs.get(id);
    return d ? { ...d } : null;
  }

  async listComplianceDocs(lotId: string): Promise<LotComplianceDoc[]> {
    return [...this.docs.values()].filter((d) => d.lotId === lotId).map((d) => ({ ...d }));
  }

  async deleteComplianceDoc(id: string): Promise<void> {
    this.docs.delete(id);
  }

  async appendAudit(entry: AuditEntry): Promise<void> {
    this.audits.push({ ...entry });
  }
}
