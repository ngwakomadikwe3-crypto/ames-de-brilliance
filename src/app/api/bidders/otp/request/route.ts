import { NextResponse } from "next/server";
import { requestLoginCode } from "../../../../../lib/bidders/service";
import { bidderWire } from "../../../../../lib/bidders/wire";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const wire = bidderWire();
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const email = String((body as { email?: unknown } | null)?.email ?? "");
  const result = await requestLoginCode(wire.directory, wire.limiter, wire.mailer, email, new Date());
  if (!result.ok && result.reason === "email_unavailable") {
    return NextResponse.json({ ok: false, error: "email_unavailable" }, { status: 503 });
  }
  const status = result.ok ? 200 : result.reason === "rate_limited" ? 429 : 400;
  return NextResponse.json(result, { status });
}
