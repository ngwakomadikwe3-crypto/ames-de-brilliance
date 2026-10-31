/**
 * Shared HMAC session verification (adb_session cookie, 8h lifetime).
 * Edge-safe: only Web Crypto and atob/btoa, so middleware (edge runtime) and
 * route handlers (node runtime) can both use it. SESSION_SECRET never leaves
 * the server.
 */

const SESSION_SECRET = process.env.SESSION_SECRET;

export async function verifySession(token: string): Promise<boolean> {
  if (!SESSION_SECRET || SESSION_SECRET.length < 32) return false;
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
    const keyData = encoder.encode(SESSION_SECRET);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

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
