import { createHmac } from 'node:crypto';

/**
 * Bidder session cookie (adb_bidder) — Phase 3a.
 *
 * Same construction as the staff adb_session cookie (base64url JSON payload +
 * HMAC-SHA256 signature, 8h), but with two hard separations so the token
 * families can never be confused:
 *   1. the signing key is DERIVED: HMAC(SESSION_SECRET, 'adb-bidder-session-v1')
 *   2. the payload carries a mandatory kind: 'bidder' claim
 * Node runtime only (routes); middleware never needs to verify bidder tokens.
 */

const BIDDER_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
export const BIDDER_COOKIE_NAME = 'adb_bidder';

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set to a value of at least 32 characters.');
  }
  return secret;
}

function bidderKey(): Buffer {
  return createHmac('sha256', sessionSecret()).update('adb-bidder-session-v1').digest();
}

function signPayload(payload: string): string {
  return createHmac('sha256', bidderKey()).update(payload).digest('base64url');
}

/** Issue the Set-Cookie value for a verified bidder session (8h). */
export function createBidderSessionCookie(bidderId: string): string {
  const payload = JSON.stringify({ ts: Date.now(), kind: 'bidder', bid: bidderId });
  const token = Buffer.from(payload).toString('base64url') + '.' + signPayload(payload);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${BIDDER_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${BIDDER_SESSION_MAX_AGE_MS / 1000}${secure}`;
}

export function clearBidderSessionCookie(): string {
  return `${BIDDER_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Verify a bidder token and return the bidder id, or null for any problem. */
export function verifyBidderToken(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const payload = Buffer.from(parts[0], 'base64url').toString();
    if (parts[1] !== signPayload(payload)) return null;
    const data = JSON.parse(payload) as { ts?: unknown; kind?: unknown; bid?: unknown };
    if (data.kind !== 'bidder' || typeof data.bid !== 'string' || data.bid.length === 0) return null;
    if (typeof data.ts !== 'number' || Date.now() - data.ts > BIDDER_SESSION_MAX_AGE_MS) return null;
    return data.bid;
  } catch {
    return null;
  }
}

/** Extract the adb_bidder cookie value from a raw Cookie header. */
export function bidderTokenFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.split(';').find((c) => c.trim().startsWith(`${BIDDER_COOKIE_NAME}=`));
  if (!match) return null;
  return match.trim().split('=').slice(1).join('=');
}
