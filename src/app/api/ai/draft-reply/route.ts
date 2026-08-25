import { NextRequest, NextResponse } from "next/server";
import { draftReply, withRetry } from "@/lib/ai";
import { getRequestById } from "@/lib/db";

const MANDATORY_SUFFIX = "\n\nAll indications are subject to written confirmation and final verification against certificate.";

export async function POST(request: NextRequest) {
  try {
    const { requestId, mandate, context } = await request.json();
    let mandateText = mandate;
    if (!mandateText && requestId) {
      const req = await getRequestById(requestId);
      if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
      mandateText = req.mandate;
    }
    if (!mandateText) {
      return NextResponse.json({ error: "mandate or requestId required" }, { status: 400 });
    }
    const draft = await withRetry(() => draftReply(mandateText, context));
    return NextResponse.json({ reply: draft.reply + MANDATORY_SUFFIX });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Draft failed" }, { status: 500 });
  }
}
