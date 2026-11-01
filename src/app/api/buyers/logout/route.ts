import { NextResponse } from "next/server";
import { clearBuyerSessionCookie } from "@/lib/buyers/session";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", clearBuyerSessionCookie());
  return response;
}
