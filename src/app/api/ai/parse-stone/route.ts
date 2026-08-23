import { NextRequest, NextResponse } from "next/server";
import { parseStone, withRetry } from "@/lib/ai";

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text field required" }, { status: 400 });
    }
    const parsed = await withRetry(() => parseStone(text));
    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Parse failed" }, { status: 500 });
  }
}
