import type { AuditAction } from '../auction/types.ts';
import { AUCTION_TERMS_VERSION } from './terms.ts';
import type { BidderStore } from './store.ts';
import type { Bidder, BidderStatus } from './types.ts';

/**
 * Bidder lifecycle service (Phase 3a): registration, staff decisions, terms
 * acceptance, data export and anonymisation. Routes are thin wrappers over
 * these functions; the authz matrix tests exercise them directly.
 */

export interface RegisterInput {
  id: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  entityType: Bidder['entityType'];
  licenceNumber: string;
  termsVersion: string;
}

export async function registerBidder(store: BidderStore, input: RegisterInput, now = new Date()): Promise<Bidder> {
  const bidder: Bidder = {
    id: input.id,
    name: input.name,
    email: input.email.toLowerCase(),
    phone: input.phone,
    country: input.country,
    entityType: input.entityType,
    licenceNumber: input.licenceNumber,
    status: 'pending',
    statusReason: '',
    statusBy: '',
    statusAt: '',
    termsVersion: input.termsVersion,
    termsAcceptedAt: now.toISOString(),
    anonymisedAt: '',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await store.createBidder(bidder);
  await store.appendAudit({
    entity: 'bidder',
    entityId: bidder.id,
    action: 'bidder.registered',
    actor: bidder.id,
    detail: JSON.stringify({ entityType: bidder.entityType, country: bidder.country }),
    createdAt: now.toISOString(),
  });
  return bidder;
}

export type StaffDecision = 'approve' | 'reject' | 'suspend';

const DECISION_TARGET: Record<StaffDecision, BidderStatus> = {
  approve: 'verified',
  reject: 'rejected',
  suspend: 'suspended',
};

const DECISION_AUDIT: Record<StaffDecision, AuditAction> = {
  approve: 'bidder.approved',
  reject: 'bidder.rejected',
  suspend: 'bidder.suspended',
};

/**
 * Apply a staff decision. Reason is REQUIRED for every decision (the review
 * trail must explain itself). Takes effect immediately: the BidderResolver
 * re-reads the row on every request, so a suspension mid-auction blocks the
 * very next bid attempt.
 */
export async function decideBidder(
  store: BidderStore,
  bidderId: string,
  decision: StaffDecision,
  reason: string,
  staffActor: string,
  now = new Date(),
): Promise<Bidder | null> {
  const bidder = await store.getBidder(bidderId);
  if (!bidder) return null;
  await store.updateBidderStatus(bidderId, {
    status: DECISION_TARGET[decision],
    reason,
    by: staffActor,
    at: now.toISOString(),
  });
  await store.appendAudit({
    entity: 'bidder',
    entityId: bidderId,
    action: DECISION_AUDIT[decision],
    actor: staffActor,
    detail: JSON.stringify({ decision, reason }),
    createdAt: now.toISOString(),
  });
  return store.getBidder(bidderId);
}

/** Record acceptance of a terms version (usually AUCTION_TERMS_VERSION). */
export async function acceptTerms(store: BidderStore, bidderId: string, now = new Date()): Promise<boolean> {
  const bidder = await store.getBidder(bidderId);
  if (!bidder) return false;
  await store.updateBidderTerms(bidderId, { version: AUCTION_TERMS_VERSION, at: now.toISOString() });
  await store.appendAudit({
    entity: 'bidder',
    entityId: bidderId,
    action: 'bidder.terms_accepted',
    actor: bidderId,
    detail: JSON.stringify({ version: AUCTION_TERMS_VERSION }),
    createdAt: now.toISOString(),
  });
  return true;
}

/** True only when the bidder may bid right now (status AND terms current). */
export function bidderMayBid(bidder: Bidder | null): boolean {
  return !!bidder && bidder.status === 'verified' && bidder.termsVersion === AUCTION_TERMS_VERSION;
}

/** What the homepage should tell this bidder about their standing. */
export function bidderStatusMessage(bidder: Bidder | null): { state: string; message: string } {
  if (!bidder) return { state: 'anonymous', message: '' };
  if (bidder.anonymisedAt) return { state: 'anonymised', message: 'This account has been closed and its data erased.' };
  switch (bidder.status) {
    case 'pending':
      return { state: 'pending', message: 'Your application is under review by the house. We will email you once it is decided.' };
    case 'verified':
      return bidder.termsVersion === AUCTION_TERMS_VERSION
        ? { state: 'verified', message: '' }
        : { state: 'terms_stale', message: 'The auction terms have changed — please accept the current version to keep bidding.' };
    case 'rejected':
      return { state: 'rejected', message: `Your application was not approved.${bidder.statusReason ? ` Reason: ${bidder.statusReason}` : ''}` };
    case 'suspended':
      return { state: 'suspended', message: `Your bidding access is suspended.${bidder.statusReason ? ` Reason: ${bidder.statusReason}` : ''}` };
  }
}

export interface BidderExport {
  bidder: Bidder;
  documents: unknown[];
  exportedAt: string;
  exportedBy: string;
}

/**
 * Record a staff document view. The view route calls this for EVERY served
 * document — there is no code path that serves file bytes without it.
 */
export async function recordDocumentView(
  store: BidderStore,
  entry: { bidderId: string; documentId: string; filename: string; staffActor: string },
  now = new Date(),
): Promise<void> {
  await store.appendAudit({
    entity: 'bidder',
    entityId: entry.bidderId,
    action: 'bidder.document_viewed',
    actor: entry.staffActor,
    detail: JSON.stringify({ documentId: entry.documentId, filename: entry.filename }),
    createdAt: now.toISOString(),
  });
}

/** Staff-side data export (GDPR-style access request). Audited. */
export async function exportBidderData(
  store: BidderStore,
  bidderId: string,
  staffActor: string,
  now = new Date(),
): Promise<BidderExport | null> {
  const bidder = await store.getBidder(bidderId);
  if (!bidder) return null;
  const documents = await store.listDocuments(bidderId);
  await store.appendAudit({
    entity: 'bidder',
    entityId: bidderId,
    action: 'bidder.data_exported',
    actor: staffActor,
    detail: JSON.stringify({ documents: documents.length }),
    createdAt: now.toISOString(),
  });
  return { bidder, documents, exportedAt: now.toISOString(), exportedBy: staffActor };
}

/**
 * Anonymise a bidder: erase PII from the row (the document FILES are deleted
 * by the caller, which owns bucket access). Bids and audit entries keep only
 * the bidder row id — no PII — so the immutable trail is unaffected and the
 * pseudonymous id can no longer be tied to a person.
 */
export async function anonymiseBidder(
  store: BidderStore,
  bidderId: string,
  staffActor: string,
  now = new Date(),
): Promise<boolean> {
  const bidder = await store.getBidder(bidderId);
  if (!bidder) return false;
  await store.anonymiseBidder(bidderId, now.toISOString());
  await store.appendAudit({
    entity: 'bidder',
    entityId: bidderId,
    action: 'bidder.anonymised',
    actor: staffActor,
    detail: JSON.stringify({ note: 'PII erased; row id retained for bid/audit integrity' }),
    createdAt: now.toISOString(),
  });
  return true;
}
