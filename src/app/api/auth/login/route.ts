import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const PASSWORD = process.env.DASHBOARD_PASSWORD || "ames2026";
const SESSION_SECRET = process.env.SESSION_SECRET || "adb-session-secret-2026";
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

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

export function createSessionCookie(): string {
  const payload = JSON.stringify({ ts: Date.now() });
  const token = sign(payload, SESSION_SECRET);
  return `adb_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

export function validateSession(cookie: string | undefined): boolean {
  if (!cookie) return false;
  const match = cookie.split(";").find((c) => c.trim().startsWith("adb_session="));
  if (!match) return false;
  const token = match.trim().split("=").slice(1).join("=");
  return verify(token, SESSION_SECRET);
}

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    if (password === PASSWORD) {
      const response = NextResponse.json({ ok: true });
      response.headers.set("Set-Cookie", createSessionCookie());
      return response;
    }
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
