import { createHmac, randomInt } from 'node:crypto';
import type { BuyerStore } from './store.ts';

/**
 * Email one-time-code login (Phase 3a).
 *
 * - 6-digit code; only HMAC(code) under SESSION_SECRET is stored.
 * - 10-minute expiry, single-use, max 5 verify attempts per code.
 * - Request side is rate-limited through the SHARED store (per email and per
 *   IP) so limits hold across serverless instances.
 * - requestOtp always reports success to the caller (no account enumeration);
 *   it returns whether an email was actually sent so the route can log it.
 */

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_REQUEST_LIMIT_PER_EMAIL_HOUR = 5;
export const OTP_REQUEST_LIMIT_PER_IP_HOUR = 20;

export type OtpVerifyResult =
  | 'ok'
  | 'no_code'
  | 'expired'
  | 'used'
  | 'too_many_attempts'
  | 'mismatch';

export function hashOtpCode(email: string, code: string): string {
  const secret = process.env.SESSION_SECRET || '';
  return createHmac('sha256', secret).update(`${email.toLowerCase()}:${code}`).digest('hex');
}

export interface RequestOtpDeps {
  now?: Date;
  ip?: string;
  sendCode: (email: string, code: string) => Promise<boolean>;
}

/** True when a code was issued (rate limits may silently drop the request). */
export async function requestOtp(store: BuyerStore, email: string, deps: RequestOtpDeps): Promise<boolean> {
  const now = deps.now ?? new Date();
  const normalised = email.toLowerCase();

  const emailOk = await store.rateLimitHit(`otp:req:email:${normalised}`, 3600, OTP_REQUEST_LIMIT_PER_EMAIL_HOUR, now);
  const ipOk = deps.ip
    ? await store.rateLimitHit(`otp:req:ip:${deps.ip}`, 3600, OTP_REQUEST_LIMIT_PER_IP_HOUR, now)
    : true;
  if (!emailOk || !ipOk) return false; // silent — caller still answers success

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await store.putOtp({
    email: normalised,
    codeHash: hashOtpCode(normalised, code),
    expiresAt: new Date(now.getTime() + OTP_TTL_MS).toISOString(),
    attempts: 0,
    used: false,
    createdAt: now.toISOString(),
  });
  return deps.sendCode(normalised, code);
}

export async function verifyOtp(
  store: BuyerStore,
  email: string,
  code: string,
  now: Date = new Date(),
): Promise<OtpVerifyResult> {
  const normalised = email.toLowerCase();
  const row = await store.getOtp(normalised);
  if (!row) return 'no_code';
  if (row.used) return 'used';
  if (Date.parse(row.expiresAt) <= now.getTime()) return 'expired';
  if (row.attempts >= OTP_MAX_ATTEMPTS) return 'too_many_attempts';
  if (row.codeHash !== hashOtpCode(normalised, code)) {
    await store.updateOtp(normalised, { attempts: row.attempts + 1 });
    return 'mismatch';
  }
  await store.updateOtp(normalised, { used: true });
  return 'ok';
}
