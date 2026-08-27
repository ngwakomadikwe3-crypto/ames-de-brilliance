import { NextRequest, NextResponse } from "next/server";
import { disableTrader } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const trader = await disableTrader(String(id));
    if (!trader) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(trader);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
