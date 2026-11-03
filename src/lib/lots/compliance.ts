import { timingSafeEqual } from 'node:crypto';
import { hmacSignFor } from '../hmac-domain.ts';
import { sniffDocumentType, sha256Hex } from '../buyers/documents.ts';

/**
 * Lot compliance documents (STEP d1): KP certificates, origin declarations,
 * valuations, assay reports.
 *
 * - Bytes live in the PRIVATE lot-compliance bucket — buyers never see them.
 * - Uploads are magic-byte sniffed (pdf/jpeg/png/webp, <= 20 MB), reusing the
 *   buyer KYC sniffer; the client filename/MIME are never trusted.
 * - Staff view files through short-lived (5 min) HMAC-signed URLs bound to
 *   the lot, the document, the staff actor and the expiry (purpose
 *   "lot-compliance-link"); every served view is written to the audit log.
 */

export const COMPLIANCE_MAX_BYTES = 20 * 1024 * 1024;
export const COMPLIANCE_LINK_TTL_MS = 5 * 60 * 1000;

export { sniffDocumentType, sha256Hex };

export interface ComplianceLinkPayload {
  lotId: string;
  docId: string;
  /** Staff actor the link was minted for (recorded in the view audit). */
  staff: string;
  /** Expiry, epoch ms. */
  exp: number;
}

function b64url(input: string | Uint8Array): string {
  return Buffer.from(input).toString('base64url');
}

export function mintComplianceLink(payload: ComplianceLinkPayload): { token: string; sig: string } | null {
  const token = b64url(JSON.stringify(payload));
  const sig = hmacSignFor('lot-compliance-link', token);
  if (!sig) return null;
  return { token, sig };
}

/** Verify a signed compliance-view token. Returns the payload or null. */
export function verifyComplianceLink(token: string, sig: string, now = Date.now()): ComplianceLinkPayload | null {
  if (!token || !sig) return null;
  const expected = hmacSignFor('lot-compliance-link', token);
  if (!expected) return null;
  const expectedBuf = Buffer.from(expected);
  const presentedBuf = Buffer.from(sig);
  if (expectedBuf.length !== presentedBuf.length || !timingSafeEqual(expectedBuf, presentedBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64url').toString()) as Partial<ComplianceLinkPayload>;
    if (typeof payload.lotId !== 'string' || typeof payload.docId !== 'string') return null;
    if (typeof payload.staff !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp <= now) return null;
    return payload as ComplianceLinkPayload;
  } catch {
    return null;
  }
}
