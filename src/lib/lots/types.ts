/**
 * Rough-lot data model — the customer-visible catalogue (STEP d1).
 *
 * A lot is a parcel or single stone of ROUGH diamonds offered to licensed
 * buyers. This is NOT an auction: there is no bidding, no countdown, no
 * hammer. Buyers browse published lots and (from STEP d2) place offers.
 *
 * Binding amendments implemented here:
 * - (1) publishing is OWNER-only; staff prepare and submit (see authz.ts
 *   and the transition service);
 * - (2) seller licence number/type/expiry are recorded per lot, and an
 *   expired seller licence blocks publication (inclusive Africa/Gaborone
 *   calendar date, same rules as buyers/licence.ts);
 * - (5) the asking price is an integer number of minor units plus an ISO
 *   4217 alphabetic currency code, per lot, with no hardcoded default;
 * - (6) editing a material field after approval returns the lot to
 *   pending_review (see service.ts — LOT_MATERIAL_FIELDS is the list).
 */

export const LOT_STATES = ['draft', 'pending_review', 'approved', 'published', 'withdrawn'] as const;
export type LotState = (typeof LOT_STATES)[number];

/**
 * The material fields (amendment 6). A change to any of these while the lot
 * is approved or published returns it to pending_review; staff-only fields
 * (state, state_reason, the audit stamps) never demote.
 */
export const LOT_MATERIAL_FIELDS = [
  'lotNo',
  'title',
  'description',
  'origin',
  'caratTotal',
  'stonesCount',
  'colour',
  'clarity',
  'crystalForm',
  'priceMinor',
  'currency',
  'sellerLicenceNumber',
  'sellerLicenceType',
  'sellerLicenceExpiry',
  'photoFileIds',
  'modelFileId',
] as const;
export type LotMaterialField = (typeof LOT_MATERIAL_FIELDS)[number];

export interface Lot {
  id: string;
  /** Stock reference, unique per house (unique index lots_lot_no). */
  lotNo: string;
  title: string;
  description: string;
  /** Mine / source origin, e.g. Jwaneng. */
  origin: string;
  /** Total parcel weight in carats. */
  caratTotal: number;
  /** Stones in the parcel (1 for a single stone). */
  stonesCount: number;
  colour: string;
  clarity: string;
  crystalForm: string;
  /** Asking price in integer minor units of `currency` (amendment 5). */
  priceMinor: number;
  /** ISO 4217 alphabetic code, uppercase — required before submit. */
  currency: string;
  /** Seller licence fields (amendment 2); expiry is strict YYYY-MM-DD. */
  sellerLicenceNumber: string;
  sellerLicenceType: string;
  sellerLicenceExpiry: string;
  state: LotState;
  /** Required reason for reject/withdraw; '' otherwise. */
  stateReason: string;
  /** File ids in the lot-photos bucket (order = display order). */
  photoFileIds: string[];
  /** File id of the single GLB in the lot-models bucket; '' when none. */
  modelFileId: string;
  createdBy: string;
  approvedBy: string;
  approvedAt: string;
  publishedBy: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export const COMPLIANCE_DOC_TYPES = [
  'kp_certificate',
  'origin_declaration',
  'valuation',
  'assay',
  'other',
] as const;
export type ComplianceDocType = (typeof COMPLIANCE_DOC_TYPES)[number];

export interface LotComplianceDoc {
  id: string;
  lotId: string;
  docType: ComplianceDocType;
  /** File id inside the private lot-compliance bucket. */
  fileId: string;
  filename: string;
  /** Sniffed from magic bytes, never trusted from the client. */
  contentType: string;
  size: number;
  sha256: string;
  notes: string;
  uploadedBy: string;
  uploadedAt: string;
}

export class DuplicateLotNoError extends Error {
  constructor(lotNo: string) {
    super(`lot number already exists: ${lotNo}`);
    this.name = 'DuplicateLotNoError';
  }
}

/** Raised by the transition service for illegal state moves or role denials. */
export class LotTransitionError extends Error {
  code:
    | 'not_found'
    | 'illegal_transition'
    | 'role_denied'
    | 'reason_required'
    | 'incomplete'
    | 'seller_licence_expired';
  detail?: unknown;

  constructor(
    message: string,
    code: LotTransitionError['code'],
    detail?: unknown,
  ) {
    super(message);
    this.name = 'LotTransitionError';
    this.code = code;
    this.detail = detail;
  }
}

/* ── Audit vocabulary for the lot module (shared audit_log table) ── */

export const LOT_AUDIT_ACTIONS = [
  'lot.created',
  'lot.updated',
  'lot.submitted',
  'lot.approved',
  'lot.rejected',
  'lot.published',
  'lot.withdrawn',
  'lot.reopened',
  'lot.photo_added',
  'lot.photo_removed',
  'lot.model_uploaded',
  'lot.model_removed',
  'lot.model_viewed',
  'lot.compliance_uploaded',
  'lot.compliance_viewed',
  'lot.compliance_removed',
] as const;
export type LotAuditAction = (typeof LOT_AUDIT_ACTIONS)[number];
