import { createHmac } from 'node:crypto';
import type { BidderDirectory } from './directory.ts';
import type { BidderDocumentRecord } from './types.ts';
import type { AuditFn } from './service.ts';

/**
 * KYC document handling (Phase 3a).
 *
 * - Files live in the private bidder-kyc-docs bucket (no client permissions,
 *   no public URLs, ever).
 * - Uploads are allow-listed by extension AND content type, capped in size,
 *   and are never executed or rendered inline by the server.
 * - Staff view a document only through a short-lived HMAC-signed URL; the
 *   byte-serving GET audits every view with the staff actor and time.
 */

export const KYC_ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'pdf'] as const;
export const KYC_ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const KYC_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const KYC_UPLOAD_LIMIT_PER_DAY = 20;
export const DOC_VIEW_TOKEN_TTL_MS = 60 * 1000;

export interface KycStorage {
  createFile(fileId: string, bytes: Uint8Array, fileName: string, contentType: string): Promise<void>;
  getFileBytes(fileId: string): Promise<Uint8Array>;
  deleteFile(fileId: string): Promise<void>;
}

export function fileExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx === -1 ? '' : fileName.slice(idx + 1).toLowerCase();
}

export type UploadValidation =
  | { ok: true; ext: string }
  | { ok: false; reason: 'bad_type' | 'too_large' | 'empty' };

export function validateUpload(fileName: string, contentType: string, sizeBytes: number): UploadValidation {
  if (sizeBytes <= 0) return { ok: false, reason: 'empty' };
  if (sizeBytes > KYC_MAX_FILE_BYTES) return { ok: false, reason: 'too_large' };
  const ext = fileExtension(fileName);
  const extOk = (KYC_ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
  const typeOk = (KYC_ALLOWED_CONTENT_TYPES as readonly string[]).includes(contentType);
  // Extension/MIME pairs must agree: a ".pdf" claiming image/png is refused.
  const pairs: Record<string, readonly string[]> = {
    jpg: ['image/jpeg'],
    jpeg: ['image/jpeg'],
    png: ['image/png'],
    webp: ['image/webp'],
    pdf: ['application/pdf'],
  };
  if (!extOk || !typeOk || !pairs[ext]?.includes(contentType)) return { ok: false, reason: 'bad_type' };
  return { ok: true, ext };
}

/* ── Short-lived signed view tokens ── */

function docKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set to a value of at least 32 characters.');
  }
  return createHmac('sha256', secret).update('adb-doc-view-v1').digest();
}

interface DocViewPayload {
  doc: string;
  /** Staff actor label embedded at issue time (e.g. 'staff:Neo'). */
  by: string;
  exp: number;
}

/** Issue a 60-second signed view token for one document. */
export function issueDocViewToken(docId: string, staffActorLabel: string, now: Date): string {
  const payload: DocViewPayload = { doc: docId, by: staffActorLabel, exp: now.getTime() + DOC_VIEW_TOKEN_TTL_MS };
  const raw = JSON.stringify(payload);
  const b64 = Buffer.from(raw).toString('base64url');
  const sig = createHmac('sha256', docKey()).update(raw).digest('base64url');
  return `${b64}.${sig}`;
}

export function verifyDocViewToken(token: string, now: Date): DocViewPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const raw = Buffer.from(parts[0], 'base64url').toString();
    const expected = createHmac('sha256', docKey()).update(raw).digest('base64url');
    if (parts[1] !== expected) return null;
    const payload = JSON.parse(raw) as DocViewPayload;
    if (typeof payload.doc !== 'string' || typeof payload.by !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp <= now.getTime()) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Serve a document from a signed view token. Verifies the token, loads the
 * metadata, audits the view (staff actor + time), and returns the bytes.
 * Returns null for any token/lookup problem (route answers 404/401).
 */
export async function viewDocumentWithToken(
  directory: BidderDirectory,
  storage: KycStorage,
  token: string,
  now: Date,
  audit: AuditFn,
): Promise<{ doc: BidderDocumentRecord; bytes: Uint8Array } | null> {
  const payload = verifyDocViewToken(token, now);
  if (!payload) return null;
  const doc = await directory.getDocument(payload.doc);
  if (!doc) return null;
  const bytes = await storage.getFileBytes(doc.fileId);
  await audit({
    entity: 'bidder',
    entityId: doc.bidderId,
    action: 'bidder.doc_viewed',
    actor: payload.by,
    detail: { documentId: doc.id, fileName: doc.fileName },
    now,
  });
  return { doc, bytes };
}
