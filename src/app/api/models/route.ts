import { NextRequest, NextResponse } from "next/server";
import { getAllModels, addModel, getActiveModelCount, getModelPaymentReport, markModelPaid, getModelById } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const report = req.nextUrl.searchParams.get("report");
    if (report) {
      const modelId = Number(report);
      const data = getModelPaymentReport(modelId);
      return NextResponse.json(data);
    }
    const models = getAllModels();
    const activeCount = getActiveModelCount();
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
      markModelPaid(model_id, amount);
      return NextResponse.json({ ok: true });
    }
    const { name, whatsapp, instagram } = await req.json();
    if (!name) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }
    const activeCount = getActiveModelCount();
    if (activeCount >= 100) {
      return NextResponse.json({ error: "Roster full — 100 active models" }, { status: 400 });
    }
    const model = addModel(name, whatsapp || "", instagram || "");
    return NextResponse.json(model);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
