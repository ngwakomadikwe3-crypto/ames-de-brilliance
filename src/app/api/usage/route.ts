import { NextRequest, NextResponse } from "next/server";
import { getSessionRole } from "../auth/login/route";
import { getUsageStats } from "@/lib/db";

export async function GET(request: NextRequest) {
  const role = getSessionRole(request.headers.get("cookie") || undefined);
  if (role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  
  const month = request.nextUrl.searchParams.get("month");
  const startDate = month ? month + "-01" : new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  
  try {
    const stats = await getUsageStats(startDate);
    return NextResponse.json(stats);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
