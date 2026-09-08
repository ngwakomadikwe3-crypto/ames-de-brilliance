import { NextRequest, NextResponse } from "next/server";
import { authenticateModel } from "@/lib/db";
import {portalCookie} from '@/lib/legacy-auth.mjs';

export async function POST(request: NextRequest) {
  try {
    const { code, phone } = await request.json();
    if (!code) return NextResponse.json({ error: "Portal code required" }, { status: 400 });
    
    const model = await authenticateModel(code, phone || "");
    if (!model) return NextResponse.json({ error: "Invalid code or phone number" }, { status: 401 });
    
    return NextResponse.json(model,{headers:{'Set-Cookie':await portalCookie(request,'model',model),'Cache-Control':'no-store'}});
  } catch (err: any) {
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}
