import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getStaffByCodeAndPassword } from "@/lib/db";

const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

function getSessionSecret(): string {
  if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be set to a value of at least 32 characters.");
  }
  return SESSION_SECRET;
}

function getFallbackCodes(): Record<string, string> {
  const codes: Record<string, string> = {};
  if (process.env.OWNER_CODE) codes[process.env.OWNER_CODE] = "owner";
  if (process.env.COUSIN_CODE) codes[process.env.COUSIN_CODE] = "cousin";
  return codes;
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

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();
    if (!code) return NextResponse.json({ error: "Access code required" }, { status: 400 });

    // Try database first
    const staff = await getStaffByCodeAndPassword(code);
    if (staff) {
      const response = NextResponse.json({ ok: true, role: staff.role, name: staff.name });
      response.headers.set("Set-Cookie", createSessionCookie(staff.role));
      return response;
    }

    // Optional emergency access codes, configured only through the environment.
    const role = getFallbackCodes()[code];
    if (role) {
      const response = NextResponse.json({ ok: true, role, name: role === "owner" ? "Owner" : "Cousin" });
      response.headers.set("Set-Cookie", createSessionCookie(role));
      return response;
    }

    return NextResponse.json({ error: "Invalid access code" }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
