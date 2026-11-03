import { timingSafeEqual } from 'node:crypto';
import { hmacSignFor } from '../hmac-domain.ts';

/**
 * Lot 3D model handling (STEP d1, amendment 8 and the 3D lot-model block).
 *
 * - Single-file GLB ONLY. The glTF binary magic bytes ("glTF") and the
 *   version field (must be 2) are checked server-side; the client filename
 *   and MIME type are never trusted.
 * - Size cap is configurable via LOT_MODEL_MAX_BYTES (default 50 MB, hard
 *   ceiling 100 MB — the lot-models bucket limit).
 * - Upload is server-mediated through a short-lived HMAC TICKET bound to the
 *   lot and the staff actor (purpose "lot-upload-ticket"). DEVIATION from the
 *   letter of amendment 8 ("direct-to-storage upload"), flagged for review:
 *   the buckets are server-only (PR #30 lockdown) and the app has no
 *   Appwrite Auth user sessions, and Appwrite offers no presigned-upload
 *   mechanism — so a browser cannot write to storage directly. The ticket
 *   keeps the upload a single-purpose, expiring capability rather than a
 *   general session-authorized endpoint.
 * - Viewing uses short-lived (5 min) HMAC-signed URLs (purpose
 *   "lot-model-link") minted per lot per viewer. Access policy is
 *   LOT_MODEL_ACCESS: "verified" (default — verified buyers and staff only,
 *   every served view written to the audit log) or "browsers" (anyone who
 *   can browse the catalogue).
 */

export const LOT_MODEL_DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
export const LOT_MODEL_BUCKET_CEILING_BYTES = 100 * 1024 * 1024;
export const LOT_MODEL_LINK_TTL_MS = 5 * 60 * 1000;
export const LOT_UPLOAD_TICKET_TTL_MS = 2 * 60 * 1000;

export type LotModelAccess = 'verified' | 'browsers';

/** Model access policy; anything unrecognised keeps the strict default. */
export function lotModelAccess(env: NodeJS.ProcessEnv = process.env): LotModelAccess {
  return env.LOT_MODEL_ACCESS === 'browsers' ? 'browsers' : 'verified';
}

/** Upload size cap; unparseable values keep the default, ceilings apply. */
export function lotModelMaxBytes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.LOT_MODEL_MAX_BYTES ?? '');
  if (!Number.isFinite(raw) || raw <= 0) return LOT_MODEL_DEFAULT_MAX_BYTES;
  return Math.min(Math.floor(raw), LOT_MODEL_BUCKET_CEILING_BYTES);
}

/**
 * glTF binary sniffing: 4-byte magic "glTF", uint32 LE version === 2, and a
 * declared total length that fits inside the actual byte count.
 */
export function isGlb(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  if (bytes[0] !== 0x67 || bytes[1] !== 0x6c || bytes[2] !== 0x54 || bytes[3] !== 0x46) return false; // glTF
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) !== 2) return false;
  const declared = view.getUint32(8, true);
  return declared > 12 && declared <= bytes.length;
}

/* ── Signed model view links ── */

export interface ModelLinkPayload {
  lotId: string;
  /** File id at mint time; the serve route refuses when the lot's model changed. */
  fileId: string;
  /** Who the link was minted for ('buyer:<id>' or 'staff:<role>') — recorded in the view audit. */
  viewer: string;
  /** Expiry, epoch ms. */
  exp: number;
}

function b64url(input: string | Uint8Array): string {
  return Buffer.from(input).toString('base64url');
}

export function mintModelLink(payload: ModelLinkPayload): { token: string; sig: string } | null {
  const token = b64url(JSON.stringify(payload));
  const sig = hmacSignFor('lot-model-link', token);
  if (!sig) return null;
  return { token, sig };
}

/** Verify a signed model-view token. Returns the payload or null. */
export function verifyModelLink(token: string, sig: string, now = Date.now()): ModelLinkPayload | null {
  if (!token || !sig) return null;
  const expected = hmacSignFor('lot-model-link', token);
  if (!expected) return null;
  const expectedBuf = Buffer.from(expected);
  const presentedBuf = Buffer.from(sig);
  if (expectedBuf.length !== presentedBuf.length || !timingSafeEqual(expectedBuf, presentedBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64url').toString()) as Partial<ModelLinkPayload>;
    if (typeof payload.lotId !== 'string' || typeof payload.fileId !== 'string') return null;
    if (typeof payload.viewer !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp <= now) return null;
    return payload as ModelLinkPayload;
  } catch {
    return null;
  }
}

/* ── Staff upload tickets ── */

export interface UploadTicketPayload {
  lotId: string;
  /** Staff actor the ticket was minted for. */
  staff: string;
  /** Expiry, epoch ms. */
  exp: number;
}

export function mintUploadTicket(payload: UploadTicketPayload): { token: string; sig: string } | null {
  const token = b64url(JSON.stringify(payload));
  const sig = hmacSignFor('lot-upload-ticket', token);
  if (!sig) return null;
  return { token, sig };
}

/** Verify an upload ticket. Returns the payload or null. */
export function verifyUploadTicket(token: string, sig: string, now = Date.now()): UploadTicketPayload | null {
  if (!token || !sig) return null;
  const expected = hmacSignFor('lot-upload-ticket', token);
  if (!expected) return null;
  const expectedBuf = Buffer.from(expected);
  const presentedBuf = Buffer.from(sig);
  if (expectedBuf.length !== presentedBuf.length || !timingSafeEqual(expectedBuf, presentedBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64url').toString()) as Partial<UploadTicketPayload>;
    if (typeof payload.lotId !== 'string' || typeof payload.staff !== 'string') return null;
    if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
    return payload as UploadTicketPayload;
  } catch {
    return null;
  }
}
