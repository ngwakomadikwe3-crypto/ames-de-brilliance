import { NextResponse } from "next/server";
import { registerBidder } from "../../../../lib/bidders/service";
import { bidderWire } from "../../../../lib/bidders/wire";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const wire = bidderWire();
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const result = await registerBidder(wire.directory, wire.limiter, body, new Date(), wire.audit);
  const status = result.ok ? 201 : result.reason === "rate_limited" ? 429 : 400;
  return NextResponse.json(result, { status });
}
