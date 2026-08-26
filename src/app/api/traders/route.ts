import { NextRequest, NextResponse } from "next/server";
import { getAllTraders, createTrader } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getAllTraders());
}

export async function POST(req: NextRequest) {
  try {
    const { name, phone } = await req.json();
    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
    const trader = await createTrader(name, phone || "");
    return NextResponse.json(trader);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
