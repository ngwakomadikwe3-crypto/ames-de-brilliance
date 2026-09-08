import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getStaffByCodeAndPassword } from "@/lib/db";
import { SESSION_MAX_AGE, sessionSecret, sessionRole } from "@/lib/session-policy";

const SESSION_SECRET = sessionSecret(process.env.SESSION_SECRET);


function sign(payload: string, secret: string): string {
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return Buffer.from(payload).toString("base64url") + "." + sig;
}

function verify(token: string, secret: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const payload = Buffer.from(parts[0], "base64url").toString();
  const expectedSig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  const received = Buffer.from(parts[1], 'base64url'), expected = Buffer.from(expectedSig, 'base64url');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export function createSessionCookie(role: string): string {
  if (!SESSION_SECRET || !sessionRole({ ts: Date.now(), role })) throw new Error('Session configuration unavailable');
  const payload = JSON.stringify({ ts: Date.now(), role });
  const token = sign(payload, SESSION_SECRET);
  return `adb_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

export function getSessionRole(cookie: string | undefined): string | null {
  if (!cookie || !SESSION_SECRET) return null;
  const match = cookie.split(";").find((c) => c.trim().startsWith("adb_session="));
  if (!match) return null;
  const token = match.trim().split("=").slice(1).join("=");
  if (!verify(token, SESSION_SECRET)) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
    return sessionRole(payload);
  } catch { return null; }
}

export function validateSession(cookie: string | undefined): boolean {
  return getSessionRole(cookie) !== null;
}

export async function POST(request: NextRequest) {
  if (!SESSION_SECRET) return NextResponse.json({ error: 'Authentication is not configured' }, { status: 503 });
  const origin = request.headers.get('origin');
  // Reverse proxies may forward HTTP internally while the configured site is HTTPS.
  if (origin && origin !== (process.env.AMES_APP_ORIGIN || request.nextUrl.origin)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const { code } = await request.json();
    if (typeof code !== 'string' || !code || code.length > 256) return NextResponse.json({ error: "Access code required" }, { status: 400 });

    // Try database first
    const staff = await getStaffByCodeAndPassword(code);
    if (staff) {
      const response = NextResponse.json({ ok: true, role: staff.role, name: staff.name });
      response.headers.set("Set-Cookie", createSessionCookie(staff.role));
      return response;
    }

    return NextResponse.json({ error: "Invalid access code" }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
