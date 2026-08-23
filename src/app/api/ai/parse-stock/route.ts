import { NextRequest, NextResponse } from "next/server";
import { parseStock, withRetry } from "@/lib/ai";

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();
    if (!text || !text.trim()) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }
    const result = await withRetry(() => parseStock(text));
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Parse stock failed" }, { status: 500 });
  }
}
