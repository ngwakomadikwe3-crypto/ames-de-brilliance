/**
 * Bidder account records (Phase 3a).
 *
 * The bidder id is pseudonymous by construction: 'b' + HMAC(SESSION_SECRET,
 * 'bidder:' + normalizedEmail), hex-truncated. Bids and audit entries only
 * ever carry this id — never an email, name or document reference — so
 * anonymisation can erase all PII without breaking the bid history or the
 * immutable audit trail.
 */

export const BIDDER_STATUSES = ['pending', 'verified', 'rejected', 'suspended'] as const;
export type BidderStatus = (typeof BIDDER_STATUSES)[number];

export const ENTITY_TYPES = ['individual', 'company'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export interface BidderRecord {
  id: string;
  name: string;
  /** Normalized (trimmed, lowercased) email — the login identifier. */
  email: string;
  phone: string;
  country: string;
  entityType: EntityType;
  licenceNumber: string;
  status: BidderStatus;
  /** Staff-supplied reason for the current status (required on decisions). */
  statusReason: string;
  /** Terms version accepted ('' = never) and when. */
  termsVersion: string;
  termsAcceptedAt: string;
  /** Set when PII was erased; the row stays for the audit trail. */
  anonymisedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface BidderDocumentRecord {
  id: string;
  bidderId: string;
  /** File id inside the private KYC bucket. */
  fileId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface BidderOtpRecord {
  id: string;
  email: string;
  /** HMAC of the code — the plaintext code is never stored. */
  codeHash: string;
  expiresAt: string;
  /** Set on successful verify; the code is single-use. */
  usedAt: string;
  createdAt: string;
}
