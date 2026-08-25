import { NextRequest, NextResponse } from "next/server";
import { getAllModels, addModel, getActiveModelCount, getModelPaymentReport, markModelPaid, getModelById } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const report = req.nextUrl.searchParams.get("report");
    if (report) {
      const data = await getModelPaymentReport(report);
      return NextResponse.json(data);
    }
    const models = await getAllModels();
    const activeCount = await getActiveModelCount();
    return NextResponse.json({ models, activeCount, rosterFull: activeCount >= 100 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action, model_id, amount } = await req.json();
    if (action === "mark_paid") {
      if (!model_id || !amount) {
        return NextResponse.json({ error: "model_id and amount required" }, { status: 400 });
      }
      await markModelPaid(String(model_id), amount);
      return NextResponse.json({ ok: true });
    }
    const { name, whatsapp, instagram } = await req.json();
    if (!name) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }
    const activeCount = await getActiveModelCount();
    if (activeCount >= 100) {
      return NextResponse.json({ error: "Roster full — 100 active models" }, { status: 400 });
    }
    const model = await addModel(name, whatsapp || "", instagram || "");
    return NextResponse.json(model);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
