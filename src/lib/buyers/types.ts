/**
 * Buyer account data model — rough catalogue and offer platform.
 *
 * PII lives ONLY here (and in the buyer-docs bucket). Offers, deals and the
 * audit trail reference the buyer row id, never personal data, so
 * anonymisation erases the person while the immutable history stays intact.
 *
 * Licence fields (amendment 2, STEP 0): licenceNumber, licenceType and
 * licenceExpiry are REQUIRED at registration and verified by staff at
 * approval time (licenceVerifiedAt/By). An expired licence blocks offers —
 * see buyerMayOffer in service.ts — even for previously verified buyers.
 */

export const BUYER_STATUSES = ['pending', 'verified', 'rejected', 'suspended'] as const;
export type BuyerStatus = (typeof BUYER_STATUSES)[number];

export const BUYER_ENTITY_TYPES = ['individual', 'company'] as const;
export type BuyerEntityType = (typeof BUYER_ENTITY_TYPES)[number];

export interface Buyer {
  id: string;
  name: string;
  /** Lowercase-normalised; the login/registration key. */
  email: string;
  phone: string;
  country: string;
  entityType: BuyerEntityType;
  /** Diamond trading licence number — REQUIRED (amendment 2). */
  licenceNumber: string;
  /** Licence type (e.g. KP, dealer, manufacturer) — REQUIRED. */
  licenceType: string;
  /** Licence expiry, ISO date/datetime — REQUIRED; expiry blocks offers. */
  licenceExpiry: string;
  /** Set when staff verify the licence at approval; '' until then. */
  licenceVerifiedAt: string;
  licenceVerifiedBy: string;
  status: BuyerStatus;
  /** Required reason for reject/suspend; '' otherwise. */
  statusReason: string;
  /** Staff actor label (e.g. 'staff:owner') who made the last decision. */
  statusBy: string;
  statusAt: string;
  /** Terms version the buyer last accepted; must equal the current version to make offers. */
  termsVersion: string;
  termsAcceptedAt: string;
  /** ISO timestamp when PII was erased; '' while the account is intact. */
  anonymisedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface BuyerOtp {
  /** Row key: the lowercase email. */
  email: string;
  /** HMAC of the code — the plaintext code is never stored. */
  codeHash: string;
  expiresAt: string;
  attempts: number;
  used: boolean;
  createdAt: string;
}

export interface BuyerDocument {
  id: string;
  buyerId: string;
  /** File id inside the private buyer-docs bucket. */
  fileId: string;
  filename: string;
  /** Sniffed from magic bytes, never trusted from the client. */
  contentType: string;
  size: number;
  sha256: string;
  uploadedAt: string;
}

export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`buyer already exists: ${email}`);
    this.name = 'DuplicateEmailError';
  }
}

/* ── Audit trail (local to the buyer module; no auction dependency) ──
 *
 * The audit_log table is shared infrastructure, but the buyer module owns
 * its entity and action vocabulary. Offers/deals add their own entities in
 * step (d); this list is intentionally buyer-scoped here.
 */

export type BuyerAuditEntity = 'buyer';

export const BUYER_AUDIT_ACTIONS = [
  'buyer.registered',
  'buyer.login',
  'buyer.login_failed',
  'buyer.approved',
  'buyer.rejected',
  'buyer.suspended',
  'buyer.terms_accepted',
  'buyer.document_uploaded',
  'buyer.document_viewed',
  'buyer.data_exported',
  'buyer.anonymised',
] as const;
export type BuyerAuditAction = (typeof BUYER_AUDIT_ACTIONS)[number];

export interface AuditEntry {
  /** Free-form entity label ('buyer' here; offers/deals use their own). */
  entity: string;
  entityId: string;
  /** Free-form action string; buyer actions come from BUYER_AUDIT_ACTIONS. */
  action: string;
  /** Who performed/requested the action; 'system' for time-driven transitions. */
  actor: string;
  /** JSON string with structured detail. */
  detail: string;
  createdAt: string;
}
