import { NextResponse } from "next/server";
import { getSessionRole } from "@/app/api/auth/login/route";
import { isJewelryOwner } from "./jewelry-workflow";

export function jewelryOwnerGuard(request: Request): NextResponse | null {
  const role = getSessionRole(request.headers.get("cookie") || undefined);
  if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isJewelryOwner(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}
