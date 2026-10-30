import type { BidderDirectory } from './directory.ts';
import type { KycStorage } from './kyc.ts';
import type { AuditFn } from './service.ts';
import type { Bid } from '../auction/types.ts';

/**
 * Data protection (Phase 3a): export and anonymise.
 *
 * Export: everything we hold about the bidder, as JSON — profile, document
 * metadata, bids and audit references.
 *
 * Anonymise: tombstones every PII field on the bidder row and deletes the KYC
 * files + metadata. The pseudonymous row id STAYS, and bids/audit entries are
 * deliberately untouched: the immutable audit trail and hammer-price history
 * only ever contained that pseudonymous id (a keyed HMAC of the email) and
 * money amounts — never a name, email or document — so erasing PII does not
 * break the trail. The id is not reversible without SESSION_SECRET.
 * Consequence: the erased email cannot re-register (same deterministic id);
 * that is a support case, documented in docs/DATA_RETENTION.md.
 */

export interface BidderExport {
  exportedAt: string;
  bidder: unknown;
  documents: unknown[];
  bids: Bid[];
  auditEntryCount: number;
}

interface AuditSource {
  /** Audit entries whose entityId is the bidder id. */
  auditCountForEntity(entityId: string): Promise<number>;
}

interface BidSource {
  /** All bids placed by the bidder. */
  bidsForBidder(bidderId: string): Promise<Bid[]>;
}

export async function exportBidderData(
  directory: BidderDirectory,
  bidderId: string,
  bids: BidSource,
  audits: AuditSource,
  now: Date,
  audit: AuditFn,
  actorLabel: string,
): Promise<BidderExport | null> {
  const bidder = await directory.getBidder(bidderId);
  if (!bidder) return null;
  const documents = await directory.listDocuments(bidderId);
  const bidRows = await bids.bidsForBidder(bidderId);
  const auditCount = await audits.auditCountForEntity(bidderId);
  await audit({
    entity: 'bidder',
    entityId: bidderId,
    action: 'bidder.exported',
    actor: actorLabel,
    detail: { documents: documents.length, bids: bidRows.length },
    now,
  });
  return { exportedAt: now.toISOString(), bidder, documents, bids: bidRows, auditEntryCount: auditCount };
}

export interface AnonymiseResult {
  ok: boolean;
  reason?: 'not_found' | 'already_anonymised';
  documentsRemoved: number;
}

export async function anonymiseBidder(
  directory: BidderDirectory,
  storage: KycStorage,
  bidderId: string,
  now: Date,
  audit: AuditFn,
  actorLabel: string,
  reason = '',
): Promise<AnonymiseResult> {
  const bidder = await directory.getBidder(bidderId);
  if (!bidder) return { ok: false, reason: 'not_found', documentsRemoved: 0 };
  if (bidder.anonymisedAt) return { ok: false, reason: 'already_anonymised', documentsRemoved: 0 };

  // Documents are PII: delete the files first, then their metadata rows.
  const documents = await directory.listDocuments(bidderId);
  let removed = 0;
  for (const docMeta of documents) {
    try {
      await storage.deleteFile(docMeta.fileId);
    } catch {
      // File already gone — still remove the metadata row below.
    }
    await directory.deleteDocument(docMeta.id);
    removed += 1;
  }

  await directory.anonymiseBidder(bidderId, {
    at: now.toISOString(),
    tombstoneEmail: `deleted-${bidderId.slice(1, 21)}@anonymised.invalid`,
  });

  await audit({
    entity: 'bidder',
    entityId: bidderId,
    action: 'bidder.anonymised',
    actor: actorLabel,
    detail: { documentsRemoved: removed, reason },
    now,
  });
  return { ok: true, documentsRemoved: removed };
}
