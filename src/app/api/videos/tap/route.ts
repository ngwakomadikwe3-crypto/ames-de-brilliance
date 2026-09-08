import { NextRequest, NextResponse } from "next/server";
import { incrementTapCount } from "@/lib/db";
import {getDb,DB_ID} from '@/lib/appwrite';

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const v=await getDb().getDocument({databaseId:DB_ID,collectionId:'videos',documentId:String(id)});if(!v.published||v.status!=='Live')return NextResponse.json({error:'Video unavailable'},{status:404});
    await incrementTapCount(String(id));
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
