import { createHash, timingSafeEqual } from 'node:crypto';
import { hmacSignFor } from '../hmac-domain.ts';

/**
 * KYC document handling (Phase 3a).
 *
 * - Uploads are validated by MAGIC BYTES, never by the client-supplied
 *   Content-Type: pdf / jpeg / png / webp only, <= 20 MB.
 * - Files land in the private buyer-docs bucket (no public URLs ever) and
 *   are never executed or rendered from an untrusted path.
 * - Staff view files through short-lived (5 min) HMAC-signed URLs bound to
 *   the document, the staff actor and the expiry; every view is audited by
 *   the serving route. Signatures use the domain-separated "buyer-doc-link"
 *   key (owner instruction 2026-11-01), so a staff session, buyer session,
 *   OTP hash or report share signature can never be replayed here.
 */

export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
export const DOCUMENT_LINK_TTL_MS = 5 * 60 * 1000;

export type DocumentKind = 'pdf' | 'jpeg' | 'png' | 'webp';

export const DOCUMENT_MIME: Record<DocumentKind, string> = {
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Sniff the real type from magic bytes. Returns null for anything else. */
export function sniffDocumentType(bytes: Uint8Array): DocumentKind | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'pdf'; // %PDF
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 // WEBP
  ) {
    return 'webp';
  }
  return null;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export interface DocumentLinkPayload {
  docId: string;
  buyerId: string;
  /** Staff actor the link was minted for (recorded in the view audit). */
  staff: string;
  /** Expiry, epoch ms. */
  exp: number;
}

function b64url(input: string | Uint8Array): string {
  return Buffer.from(input).toString('base64url');
}

function sign(value: string): string | null {
  return hmacSignFor('buyer-doc-link', value);
}

/**
 * Mint a signed document-view token (URL path segment + query sig), or null
 * when signing is unavailable — the mint route must refuse, never 500 a
 * half-minted link.
 */
export function mintDocumentLink(payload: DocumentLinkPayload): { token: string; sig: string } | null {
  const token = b64url(JSON.stringify(payload));
  const sig = sign(token);
  if (!sig) return null;
  return { token, sig };
}

/** Verify a signed document-view token. Returns the payload or null. */
export function verifyDocumentLink(token: string, sig: string, now = Date.now()): DocumentLinkPayload | null {
  if (!token || !sig) return null;
  const expected = sign(token);
  if (!expected) return null;
  const expectedBuf = Buffer.from(expected);
  const presentedBuf = Buffer.from(sig);
  if (expectedBuf.length !== presentedBuf.length || !timingSafeEqual(expectedBuf, presentedBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64url').toString()) as Partial<DocumentLinkPayload>;
    if (typeof payload.docId !== 'string' || typeof payload.buyerId !== 'string') return null;
    if (typeof payload.staff !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp <= now) return null;
    return payload as DocumentLinkPayload;
  } catch {
    return null;
  }
}
