import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Passwordless email one-time codes (Phase 3a).
 *
 * 6-digit code, 10-minute TTL, single-use. Only the HMAC of the code is
 * stored (keyed by SESSION_SECRET + email), so a database read never reveals
 * a usable code. Request and verify budgets live in the shared rate_limits
 * table (see service.ts) — never in-process memory.
 */

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_REQUEST_LIMIT_PER_HOUR = 5;
export const OTP_VERIFY_LIMIT_PER_WINDOW = 8;
export const OTP_VERIFY_WINDOW_SECONDS = 600;

/** Zero-padded 6-digit code from a CSPRNG. */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** HMAC of (email, code) — the only thing stored. */
export function hashOtpCode(email: string, code: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set to a value of at least 32 characters.');
  }
  return createHmac('sha256', secret).update(`otp-code:${email}:${code}`).digest('hex');
}

export function otpCodeMatches(email: string, code: string, storedHash: string): boolean {
  const presented = Buffer.from(hashOtpCode(email, code));
  const stored = Buffer.from(storedHash);
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}
