import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getStaffByCodeAndPassword } from "@/lib/db";

const SESSION_SECRET = process.env.SESSION_SECRET || "adb-session-secret-2026";
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

// Fallback codes if no staff in DB
const FALLBACK_CODES: Record<string, string> = {
  [process.env.OWNER_CODE || "ames-owner"]: "owner",
  [process.env.COUSIN_CODE || "ames-cousin"]: "cousin",
};

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
  const token = sign(payload, SESSION_SECRET);
  return `adb_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

export function getSessionRole(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const match = cookie.split(";").find((c) => c.trim().startsWith("adb_session="));
  if (!match) return null;
  const token = match.trim().split("=").slice(1).join("=");
  if (!verify(token, SESSION_SECRET)) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
    return payload.role || null;
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

    // Fallback to env codes
    const role = FALLBACK_CODES[code];
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
