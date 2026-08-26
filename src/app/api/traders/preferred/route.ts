import { NextRequest, NextResponse } from "next/server";
import { togglePreferredTrader } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const preferred = await togglePreferredTrader(String(id));
    return NextResponse.json({ id, preferred });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
