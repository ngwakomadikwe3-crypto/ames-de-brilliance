import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Expiring share links for report PDFs (owner decision 2026-10-31).
 *
 * Report PDFs are staff-only by default. When a report needs to be shared
 * outside the house, a staff member mints a short-lived signed link via
 * POST /api/reports/share; the reports file route accepts either a valid
 * staff session or a valid (unexpired, untampered) share signature.
 *
 * The signature is HMAC-SHA256("<fileId>.<expires>") under
 * REPORT_SHARE_SECRET, falling back to SESSION_SECRET — set a distinct
 * REPORT_SHARE_SECRET to rotate share links independently of sessions.
 * Links carry no identity and grant read access to exactly one file id.
 */

export const REPORT_SHARE_DEFAULT_TTL_SECONDS = 900; // 15 minutes
export const REPORT_SHARE_MAX_TTL_SECONDS = 24 * 3600;

function shareSecret(): string {
  return process.env.REPORT_SHARE_SECRET || process.env.SESSION_SECRET || "";
}

export function reportShareTtlSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.REPORT_SHARE_TTL_SECONDS ?? "");
  if (!Number.isFinite(raw) || raw <= 0) return REPORT_SHARE_DEFAULT_TTL_SECONDS;
  return Math.min(Math.floor(raw), REPORT_SHARE_MAX_TTL_SECONDS);
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export interface ReportShareLink {
  /** Expiry as epoch SECONDS (URL-friendly). */
  expires: number;
  sig: string;
}

/** Mint a share signature, or null when no usable secret is configured. */
export function mintReportShareLink(
  fileId: string,
  now: number = Date.now(),
  ttlSeconds: number = reportShareTtlSeconds(),
): ReportShareLink | null {
  const secret = shareSecret();
  if (secret.length < 32) return null;
  const expires = Math.floor(now / 1000) + ttlSeconds;
  return { expires, sig: sign(`${fileId}.${expires}`, secret) };
}

/** Constant-time verification of a share signature against file id + expiry. */
export function verifyReportShareLink(
  fileId: string,
  expires: string,
  sig: string,
  now: number = Date.now(),
): boolean {
  const secret = shareSecret();
  if (secret.length < 32) return false;
  if (!/^\d{1,15}$/.test(expires) || !/^[A-Za-z0-9_-]{20,80}$/.test(sig)) return false;
  const exp = Number(expires);
  if (!Number.isSafeInteger(exp) || exp * 1000 <= now) return false;
  const expected = Buffer.from(sign(`${fileId}.${exp}`, secret));
  const presented = Buffer.from(sig);
  return expected.length === presented.length && timingSafeEqual(expected, presented);
}
