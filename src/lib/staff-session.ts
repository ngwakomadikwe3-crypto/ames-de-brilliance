import crypto from "crypto";

const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

function getSessionSecret(): string {
  if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be set to a value of at least 32 characters.");
  }
  return SESSION_SECRET;
}

function sign(payload: string, secret: string): string {
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return Buffer.from(payload).toString("base64url") + "." + sig;
}

function verify(token: string, secret: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const payload = Buffer.from(parts[0], "base64url").toString();
  const expectedSig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return parts[1] === expectedSig;
}

export function createSessionCookie(role: string): string {
  const payload = JSON.stringify({ ts: Date.now(), role });
  const token = sign(payload, getSessionSecret());
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `adb_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secure}`;
}

export function getSessionRole(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const match = cookie.split(";").find((c) => c.trim().startsWith("adb_session="));
  if (!match) return null;
  const token = match.trim().split("=").slice(1).join("=");
  if (!verify(token, getSessionSecret())) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
    if (typeof payload.ts !== "number" || Date.now() - payload.ts > SESSION_MAX_AGE * 1000) return null;
    return typeof payload.role === "string" ? payload.role : null;
  } catch { return null; }
}

export function validateSession(cookie: string | undefined): boolean {
  return getSessionRole(cookie) !== null;
}

