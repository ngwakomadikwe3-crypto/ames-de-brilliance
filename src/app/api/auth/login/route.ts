import { NextRequest, NextResponse } from "next/server";
import { createSessionCookie } from "@/lib/staff-session";
import { getStaffByCodeAndPassword } from "@/lib/db";

function getFallbackCodes(): Record<string, string> {
  const codes: Record<string, string> = {};
  if (process.env.OWNER_CODE) codes[process.env.OWNER_CODE] = "owner";
  if (process.env.COUSIN_CODE) codes[process.env.COUSIN_CODE] = "cousin";
  return codes;
}

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();
    if (typeof code !== 'string' || !code || code.length > 256) return NextResponse.json({ error: "Access code required" }, { status: 400 });

    // Try database first
    const staff = await getStaffByCodeAndPassword(code).catch(() => undefined);
    if (staff) {
      const response = NextResponse.json({ ok: true, role: staff.role, name: staff.name });
      response.headers.set("Set-Cookie", createSessionCookie(staff.role));
      return response;
    }

    // Optional emergency access codes, configured only through the environment.
    const fallbackCodes = getFallbackCodes();
    const role = Object.hasOwn(fallbackCodes, code) ? fallbackCodes[code] : undefined;
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
