import { NextRequest, NextResponse } from "next/server";

/** Photos are now served directly from Appwrite Storage URLs.
 *  This route returns a 404 for legacy /api/stones/photo/ paths. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  await params;
  return NextResponse.json({ error: "Photos are served from Appwrite Storage. Use the photo URL directly." }, { status: 404 });
}