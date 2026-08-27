import { NextRequest, NextResponse } from "next/server";
import { getSessionRole } from "../auth/login/route";

export async function GET(request: NextRequest) {
  const role = getSessionRole(request.headers.get("cookie") || undefined);
  if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ role });
}
