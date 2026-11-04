/**
 * Domain-separated HMAC labels and secret selection (owner instruction
 * 2026-11-01, secrets hardening).
 *
 * Every signing purpose — staff sessions, buyer sessions, buyer OTP codes,
 * buyer document links and report share links — uses its OWN key. By default
 * the key is derived from SESSION_SECRET as HMAC-SHA256(SESSION_SECRET,
 * label), so a signature minted for one purpose can never verify for
 * another even though all purposes share the one configured secret. Any
 * purpose can instead be given a fully independent secret via its dedicated
 * env var (the label is still applied, so even reusing the same string for
 * two purposes keeps them separated).
 *
 * This module is edge-safe (no node imports); the actual crypto lives in
 * hmac-domain.ts (node runtime) and session-keys.ts (Web Crypto), which
 * derive identical key bytes so edge middleware and node routes verify the
 * same tokens.
 */

export type SigningPurpose =
  | "staff-session"
  | "buyer-session"
  | "buyer-otp"
  | "buyer-doc-link"
  | "report-share"
  | "lot-model-link"
  | "lot-upload-ticket"
  | "lot-compliance-link";

export const SIGNING_LABELS: Record<SigningPurpose, string> = {
  "staff-session": "ames:hmac:staff-session:v1",
  "buyer-session": "ames:hmac:buyer-session:v1",
  "buyer-otp": "ames:hmac:buyer-otp:v1",
  "buyer-doc-link": "ames:hmac:buyer-doc-link:v1",
  "report-share": "ames:hmac:report-share:v1",
  "lot-model-link": "ames:hmac:lot-model-link:v1",
  "lot-upload-ticket": "ames:hmac:lot-upload-ticket:v1",
  "lot-compliance-link": "ames:hmac:lot-compliance-link:v1",
};

/** Dedicated secret env var per purpose; SESSION_SECRET is the fallback. */
export const SIGNING_SECRET_ENV: Record<SigningPurpose, string> = {
  "staff-session": "STAFF_SESSION_SECRET",
  "buyer-session": "BUYER_SESSION_SECRET",
  "buyer-otp": "BUYER_OTP_SECRET",
  "buyer-doc-link": "BUYER_DOC_LINK_SECRET",
  "report-share": "REPORT_SHARE_SECRET",
  "lot-model-link": "LOT_MODEL_LINK_SECRET",
  "lot-upload-ticket": "LOT_UPLOAD_TICKET_SECRET",
  "lot-compliance-link": "LOT_COMPLIANCE_LINK_SECRET",
};

export const MIN_SECRET_LENGTH = 32;

export function isProductionEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
}

/**
 * Pick the base secret for a purpose, or null when signing must be refused:
 *  - a dedicated secret that is set but shorter than MIN_SECRET_LENGTH is a
 *    loud misconfiguration — fail closed, never silently fall back;
 *  - report-share has NO SESSION_SECRET fallback in production:
 *    REPORT_SHARE_SECRET is required there (owner instruction 2026-11-01).
 */
export function selectSigningSecret(
  purpose: SigningPurpose,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const dedicated = env[SIGNING_SECRET_ENV[purpose]];
  if (dedicated !== undefined && dedicated !== "") {
    return dedicated.length >= MIN_SECRET_LENGTH ? dedicated : null;
  }
  if (purpose === "report-share" && isProductionEnv(env)) return null;
  const base = env.SESSION_SECRET;
  if (!base || base.length < MIN_SECRET_LENGTH) return null;
  return base;
}
