import { NextRequest, NextResponse } from "next/server";
import { approveTrader } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const trader = approveTrader(id);
    if (!trader) return NextResponse.json({ error: "Trader not found" }, { status: 404 });
    return NextResponse.json(trader);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
