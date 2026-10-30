import { NextResponse } from "next/server";
import { clearBidderSessionCookie } from "@/lib/bidders/session";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", clearBidderSessionCookie());
  return response;
}
