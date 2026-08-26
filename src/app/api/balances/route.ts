import { NextRequest, NextResponse } from "next/server";
import { getSessionRole } from "../auth/login/route";
import { getBalances, updateBalance } from "@/lib/db";

export async function GET(request: NextRequest) {
  const role = getSessionRole(request.headers.get("cookie") || undefined);
  if (role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const balances = await getBalances();
    return NextResponse.json(balances);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const role = getSessionRole(request.headers.get("cookie") || undefined);
  if (role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { service, amount, note } = await request.json();
    if (!service) return NextResponse.json({ error: "service required" }, { status: 400 });
    await updateBalance(service, amount || 0, note || "");
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
