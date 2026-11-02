/**
 * Shared HMAC session verification (adb_session cookie, 8h lifetime).
 * Edge-safe: only Web Crypto and atob/btoa, so middleware (edge runtime) and
 * route handlers (node runtime) can both use it. SESSION_SECRET never leaves
 * the server.
 *
 * The signing key is domain-separated (owner instruction 2026-11-01):
 * HMAC-SHA256(STAFF_SESSION_SECRET || SESSION_SECRET,
 * "ames:hmac:staff-session:v1") — a buyer token, report share signature or
 * document link minted under the same base secret can never verify here.
 */

import { hmacKeyFor } from "./session-keys.ts";

export async function verifySession(token: string): Promise<boolean> {
  const cryptoKey = await hmacKeyFor("staff-session");
  if (!cryptoKey) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  try {
    const payload = parts[0];
    const signature = parts[1];

    const payloadStr = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const session = JSON.parse(payloadStr);
    if (typeof session.ts !== "number" || Date.now() - session.ts > 8 * 60 * 60 * 1000) {
      return false;
    }

    const encoder = new TextEncoder();
    const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(payloadStr));
    const sigArray = new Uint8Array(sigBuffer);
    const expectedSig = btoa(String.fromCharCode(...sigArray))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    return signature === expectedSig;
  } catch {
    return false;
  }
}

/** Extract the adb_session cookie value from a raw Cookie header. */
export function sessionTokenFromCookieHeader(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.split(";").find((c) => c.trim().startsWith("adb_session="));
  if (!match) return undefined;
  return match.trim().split("=").slice(1).join("=");
}
