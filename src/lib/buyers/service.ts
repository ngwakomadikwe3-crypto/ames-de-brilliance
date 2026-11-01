import { BUYER_TERMS_VERSION } from './terms.ts';
import type { BuyerStore } from './store.ts';
import type { Buyer, BuyerStatus } from './types.ts';

/**
 * Buyer lifecycle service: registration, staff decisions, terms acceptance,
 * data export and anonymisation. Routes are thin wrappers over these
 * functions; the authz matrix tests exercise them directly.
 */

export interface RegisterInput {
  id: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  entityType: Buyer['entityType'];
  /** All three licence fields are REQUIRED (STEP 0 amendment 2). */
  licenceNumber: string;
  licenceType: string;
  /** ISO date/datetime string. */
  licenceExpiry: string;
  termsVersion: string;
}

export async function registerBuyer(store: BuyerStore, input: RegisterInput, now = new Date()): Promise<Buyer> {
  const buyer: Buyer = {
    id: input.id,
    name: input.name,
    email: input.email.toLowerCase(),
    phone: input.phone,
    country: input.country,
    entityType: input.entityType,
    licenceNumber: input.licenceNumber,
    licenceType: input.licenceType,
    licenceExpiry: input.licenceExpiry,
    // Unverified until a staff decision sights the licence.
    licenceVerifiedAt: '',
    licenceVerifiedBy: '',
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
  await store.createBuyer(buyer);
  await store.appendAudit({
    entity: 'buyer',
    entityId: buyer.id,
    action: 'buyer.registered',
    actor: buyer.id,
    detail: JSON.stringify({ entityType: buyer.entityType, country: buyer.country }),
    createdAt: now.toISOString(),
  });
  return buyer;
}

export type StaffDecision = 'approve' | 'reject' | 'suspend';

const DECISION_TARGET: Record<StaffDecision, BuyerStatus> = {
  approve: 'verified',
  reject: 'rejected',
  suspend: 'suspended',
};

const DECISION_AUDIT: Record<StaffDecision, string> = {
  approve: 'buyer.approved',
  reject: 'buyer.rejected',
  suspend: 'buyer.suspended',
};

/**
 * Apply a staff decision. Reason is REQUIRED for every decision (the review
 * trail must explain itself). Approval is also the licence-verification act
 * (amendment 2): licenceVerifiedAt/By are stamped on approve, and rejecting
 * or suspending clears them — a non-verified account's licence is not
 * verified. Takes effect immediately: the access resolver re-reads the row
 * on every request, so a suspension blocks the very next offer attempt.
 */
export async function decideBuyer(
  store: BuyerStore,
  buyerId: string,
  decision: StaffDecision,
  reason: string,
  staffActor: string,
  now = new Date(),
): Promise<Buyer | null> {
  const buyer = await store.getBuyer(buyerId);
  if (!buyer) return null;
  await store.updateBuyerStatus(buyerId, {
    status: DECISION_TARGET[decision],
    reason,
    by: staffActor,
    at: now.toISOString(),
    licenceVerifiedAt: decision === 'approve' ? now.toISOString() : '',
    licenceVerifiedBy: decision === 'approve' ? staffActor : '',
  });
  await store.appendAudit({
    entity: 'buyer',
    entityId: buyerId,
    action: DECISION_AUDIT[decision],
    actor: staffActor,
    detail: JSON.stringify({ decision, reason }),
    createdAt: now.toISOString(),
  });
  return store.getBuyer(buyerId);
}

/** Record acceptance of a terms version (usually BUYER_TERMS_VERSION). */
export async function acceptTerms(store: BuyerStore, buyerId: string, now = new Date()): Promise<boolean> {
  const buyer = await store.getBuyer(buyerId);
  if (!buyer) return false;
  await store.updateBuyerTerms(buyerId, { version: BUYER_TERMS_VERSION, at: now.toISOString() });
  await store.appendAudit({
    entity: 'buyer',
    entityId: buyerId,
    action: 'buyer.terms_accepted',
    actor: buyerId,
    detail: JSON.stringify({ version: BUYER_TERMS_VERSION }),
    createdAt: now.toISOString(),
  });
  return true;
}

/**
 * True only when the buyer may MAKE OFFERS right now (amendment 2): staff-
 * verified account, current terms accepted, all three licence fields present,
 * staff-verified licence, and the licence not expired. `now` is injectable
 * for tests; expiry is checked at request time so a licence that lapses
 * mid-relationship blocks the very next offer without staff action.
 */
export function buyerMayOffer(buyer: Buyer | null, now: Date = new Date()): boolean {
  if (!buyer) return false;
  if (buyer.status !== 'verified') return false;
  if (buyer.termsVersion !== BUYER_TERMS_VERSION) return false;
  if (!buyer.licenceNumber || !buyer.licenceType || !buyer.licenceExpiry) return false;
  if (!buyer.licenceVerifiedAt) return false;
  const expiry = Date.parse(buyer.licenceExpiry);
  if (!Number.isFinite(expiry) || expiry <= now.getTime()) return false;
  return true;
}

/** What the catalogue should tell this buyer about their standing. */
export function buyerStatusMessage(buyer: Buyer | null, now: Date = new Date()): { state: string; message: string } {
  if (!buyer) return { state: 'anonymous', message: '' };
  if (buyer.anonymisedAt) return { state: 'anonymised', message: 'This account has been closed and its data erased.' };
  switch (buyer.status) {
    case 'pending':
      return { state: 'pending', message: 'Your application is under review by the house. We will email you once it is decided.' };
    case 'verified': {
      if (buyer.termsVersion !== BUYER_TERMS_VERSION) {
        return { state: 'terms_stale', message: 'The buyer terms have changed — please accept the current version to keep making offers.' };
      }
      const expiry = Date.parse(buyer.licenceExpiry || '');
      if (!buyer.licenceExpiry || !Number.isFinite(expiry) || expiry <= now.getTime()) {
        return { state: 'licence_expired', message: 'Your diamond trading licence on file has expired. Provide a current licence to resume making offers.' };
      }
      return { state: 'verified', message: '' };
    }
    case 'rejected':
      return { state: 'rejected', message: `Your application was not approved.${buyer.statusReason ? ` Reason: ${buyer.statusReason}` : ''}` };
    case 'suspended':
      return { state: 'suspended', message: `Your buying access is suspended.${buyer.statusReason ? ` Reason: ${buyer.statusReason}` : ''}` };
  }
}

export interface BuyerExport {
  buyer: Buyer;
  documents: unknown[];
  exportedAt: string;
  exportedBy: string;
}

/**
 * Record a staff document view. The view route calls this for EVERY served
 * document — there is no code path that serves file bytes without it.
 */
export async function recordDocumentView(
  store: BuyerStore,
  entry: { buyerId: string; documentId: string; filename: string; staffActor: string },
  now = new Date(),
): Promise<void> {
  await store.appendAudit({
    entity: 'buyer',
    entityId: entry.buyerId,
    action: 'buyer.document_viewed',
    actor: entry.staffActor,
    detail: JSON.stringify({ documentId: entry.documentId, filename: entry.filename }),
    createdAt: now.toISOString(),
  });
}

/** Staff-side data export (GDPR-style access request). Audited. */
export async function exportBuyerData(
  store: BuyerStore,
  buyerId: string,
  staffActor: string,
  now = new Date(),
): Promise<BuyerExport | null> {
  const buyer = await store.getBuyer(buyerId);
  if (!buyer) return null;
  const documents = await store.listDocuments(buyerId);
  await store.appendAudit({
    entity: 'buyer',
    entityId: buyerId,
    action: 'buyer.data_exported',
    actor: staffActor,
    detail: JSON.stringify({ documents: documents.length }),
    createdAt: now.toISOString(),
  });
  return { buyer, documents, exportedAt: now.toISOString(), exportedBy: staffActor };
}

/**
 * Anonymise a buyer: erase PII from the row (the document FILES are deleted
 * by the caller, which owns bucket access). Offers, deals and audit entries
 * keep only the buyer row id — no PII — so the immutable trail is unaffected
 * and the pseudonymous id can no longer be tied to a person.
 */
export async function anonymiseBuyer(
  store: BuyerStore,
  buyerId: string,
  staffActor: string,
  now = new Date(),
): Promise<boolean> {
  const buyer = await store.getBuyer(buyerId);
  if (!buyer) return false;
  await store.anonymiseBuyer(buyerId, now.toISOString());
  await store.appendAudit({
    entity: 'buyer',
    entityId: buyerId,
    action: 'buyer.anonymised',
    actor: staffActor,
    detail: JSON.stringify({ note: 'PII erased; row id retained for offer/audit integrity' }),
    createdAt: now.toISOString(),
  });
  return true;
}
