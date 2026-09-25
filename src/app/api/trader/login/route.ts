import { NextRequest, NextResponse } from "next/server";
import { authenticateTrader } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { code, phone } = await request.json();
    if (!code) return NextResponse.json({ error: "Portal code required" }, { status: 400 });
    
    const trader = await authenticateTrader(code, phone || "");
    if (!trader) return NextResponse.json({ error: "Invalid code or phone number" }, { status: 401 });
    
    return NextResponse.json(trader);
  } catch (err: any) {
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}
