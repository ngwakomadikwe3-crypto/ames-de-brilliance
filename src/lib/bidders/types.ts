/**
 * Bidder account data model — Phase 3a.
 *
 * PII lives ONLY here (and in the bidder-docs bucket). Bids and the audit
 * trail reference the bidder row id, never personal data, so anonymisation
 * erases the person while the immutable history stays intact.
 */

export const BIDDER_STATUSES = ['pending', 'verified', 'rejected', 'suspended'] as const;
export type BidderStatus = (typeof BIDDER_STATUSES)[number];

export const BIDDER_ENTITY_TYPES = ['individual', 'company'] as const;
export type BidderEntityType = (typeof BIDDER_ENTITY_TYPES)[number];

export interface Bidder {
  id: string;
  name: string;
  /** Lowercase-normalised; the login/registration key. */
  email: string;
  phone: string;
  country: string;
  entityType: BidderEntityType;
  /** Botswana diamond trading licence number; '' when not supplied. */
  licenceNumber: string;
  status: BidderStatus;
  /** Required reason for reject/suspend; '' otherwise. */
  statusReason: string;
  /** Staff actor label (e.g. 'staff:owner') who made the last decision. */
  statusBy: string;
  statusAt: string;
  /** Terms version the bidder last accepted; must equal the current version to bid. */
  termsVersion: string;
  termsAcceptedAt: string;
  /** ISO timestamp when PII was erased; '' while the account is intact. */
  anonymisedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface BidderOtp {
  /** Row key: the lowercase email. */
  email: string;
  /** HMAC of the code — the plaintext code is never stored. */
  codeHash: string;
  expiresAt: string;
  attempts: number;
  used: boolean;
  createdAt: string;
}

export interface BidderDocument {
  id: string;
  bidderId: string;
  /** File id inside the private bidder-docs bucket. */
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
    super(`bidder already exists: ${email}`);
    this.name = 'DuplicateEmailError';
  }
}
