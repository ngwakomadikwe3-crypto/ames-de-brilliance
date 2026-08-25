import { NextRequest, NextResponse } from "next/server";
import { getTraderByPortalCode } from "@/lib/db";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const trader = getTraderByPortalCode(code);
  if (!trader) return NextResponse.json({ error: "Trader not found" }, { status: 404 });
  return NextResponse.json(trader);
}
