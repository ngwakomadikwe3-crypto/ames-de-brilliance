import { NextRequest, NextResponse } from "next/server";
import {
  generateWeeklyReport,
  getAllReports,
  getTraderReports,
} from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const traderId = req.nextUrl.searchParams.get("trader_id");
    if (traderId) {
      return NextResponse.json(await getTraderReports(traderId));
    }
    return NextResponse.json(await getAllReports());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { traderId } = await req.json();
    if (!traderId) {
      return NextResponse.json({ error: "traderId required" }, { status: 400 });
    }
    const report = await generateWeeklyReport(traderId);
    if (!report) {
      return NextResponse.json({ error: "Trader not found" }, { status: 404 });
    }
    return NextResponse.json(report);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
