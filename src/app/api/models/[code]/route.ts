import { NextRequest, NextResponse } from "next/server";
import { getModelByPortalCode } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const model = await getModelByPortalCode(code);
    if (!model || model.status !== "Active") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(model);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
