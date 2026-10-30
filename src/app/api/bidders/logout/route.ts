import { NextResponse } from "next/server";
import { clearBidderSessionCookie } from "../../../../lib/bidders/session";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", clearBidderSessionCookie());
  return res;
}
