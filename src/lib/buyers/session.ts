/**
 * Buyer session cookie (adb_buyer).
 *
 * Same HMAC-SHA256 scheme as the staff session (base64url(payload) + '.' +
 * base64url(signature)) but a distinct cookie name and a `kind: 'buyer'`
 * marker, so a buyer token can never be replayed as a staff session and vice
 * versa. Edge-safe: Web Crypto only.
 */

const BUYER_COOKIE = 'adb_buyer';
const MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8h, matching the staff session

export interface BuyerSessionPayload {
  ts: number;
  kind: 'buyer';
  /** Buyer row id. */
  buyerId: string;
}

function b64urlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(value: string): string {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmacKey(): Promise<CryptoKey | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function sigBytes(sig: string): Uint8Array<ArrayBuffer> {
  const b64 = sig.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Returns the Set-Cookie value, or null when SESSION_SECRET is unusable. */
export async function createBuyerSessionCookie(buyerId: string, secure: boolean): Promise<string | null> {
  const key = await hmacKey();
  if (!key) return null;
  const payload = b64urlEncode(JSON.stringify({ ts: Date.now(), kind: 'buyer', buyerId }));
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  let bin = '';
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  const token = `${payload}.${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
  return `${BUYER_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_MS / 1000}${secure ? '; Secure' : ''}`;
}

export function clearBuyerSessionCookie(): string {
  return `${BUYER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Extract the adb_buyer cookie value from a raw Cookie header. */
export function buyerTokenFromCookieHeader(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.split(';').find((c) => c.trim().startsWith(`${BUYER_COOKIE}=`));
  if (!match) return undefined;
  return match.trim().split('=').slice(1).join('=');
}

/** Verify signature, expiry and the buyer kind marker. */
export async function verifyBuyerSession(token: string | undefined): Promise<BuyerSessionPayload | null> {
  if (!token) return null;
  const key = await hmacKey();
  if (!key) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  try {
    const payload = parts[0];
    const ok = await crypto.subtle.verify('HMAC', key, sigBytes(parts[1]), new TextEncoder().encode(payload));
    if (!ok) return null;
    const data = JSON.parse(b64urlDecode(payload)) as Partial<BuyerSessionPayload>;
    if (data.kind !== 'buyer' || typeof data.buyerId !== 'string' || data.buyerId.length === 0) return null;
    if (typeof data.ts !== 'number' || data.ts > Date.now() || Date.now() - data.ts > MAX_AGE_MS) return null;
    return { ts: data.ts, kind: 'buyer', buyerId: data.buyerId };
  } catch {
    return null;
  }
}
