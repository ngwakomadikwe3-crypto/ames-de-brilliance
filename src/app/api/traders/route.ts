import { NextResponse } from "next/server";
import { getAllTraders } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getAllTraders());
}
