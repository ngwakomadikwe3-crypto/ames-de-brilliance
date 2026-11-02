import { timingSafeEqual } from "node:crypto";
import { hmacSignFor } from "./hmac-domain.ts";

/**
 * Expiring share links for report PDFs (owner decision 2026-10-31).
 *
 * Report PDFs are staff-only by default. When a report needs to be shared
 * outside the house, a staff member mints a short-lived signed link via
 * POST /api/reports/share; the reports file route accepts either a valid
 * staff session or a valid (unexpired, untampered) share signature.
 *
 * The signature is HMAC-SHA256("<fileId>.<expires>") under the
 * domain-separated "report-share" key (owner instruction 2026-11-01):
 * derived from REPORT_SHARE_SECRET, falling back to SESSION_SECRET OUTSIDE
 * production only. In production REPORT_SHARE_SECRET is REQUIRED — with no
 * fallback — so rotating or revoking share links never touches sessions, and
 * a session-secret leak cannot mint share links. Because the key is
 * domain-separated, a signature minted for a staff session, buyer session,
 * OTP code or document link is rejected here even under the same base
 * secret. Links carry no identity and grant read access to exactly one
 * file id.
 */

export const REPORT_SHARE_DEFAULT_TTL_SECONDS = 900; // 15 minutes
export const REPORT_SHARE_MAX_TTL_SECONDS = 24 * 3600;

export function reportShareTtlSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.REPORT_SHARE_TTL_SECONDS ?? "");
  if (!Number.isFinite(raw) || raw <= 0) return REPORT_SHARE_DEFAULT_TTL_SECONDS;
  return Math.min(Math.floor(raw), REPORT_SHARE_MAX_TTL_SECONDS);
}

export interface ReportShareLink {
  /** Expiry as epoch SECONDS (URL-friendly). */
  expires: number;
  sig: string;
}

/**
 * Mint a share signature, or null when signing is unavailable — including in
 * production without REPORT_SHARE_SECRET. Callers must treat null as
 * "sharing is not configured" and refuse.
 */
export function mintReportShareLink(
  fileId: string,
  now: number = Date.now(),
  ttlSeconds: number = reportShareTtlSeconds(),
): ReportShareLink | null {
  const expires = Math.floor(now / 1000) + ttlSeconds;
  const sig = hmacSignFor("report-share", `${fileId}.${expires}`);
  if (!sig) return null;
  return { expires, sig };
}

/** Constant-time verification of a share signature against file id + expiry. */
export function verifyReportShareLink(
  fileId: string,
  expires: string,
  sig: string,
  now: number = Date.now(),
): boolean {
  if (!/^\d{1,15}$/.test(expires) || !/^[A-Za-z0-9_-]{20,80}$/.test(sig)) return false;
  const exp = Number(expires);
  if (!Number.isSafeInteger(exp) || exp * 1000 <= now) return false;
  const expected = hmacSignFor("report-share", `${fileId}.${exp}`);
  if (!expected) return false;
  const expectedBuf = Buffer.from(expected);
  const presented = Buffer.from(sig);
  return expectedBuf.length === presented.length && timingSafeEqual(expectedBuf, presented);
}
