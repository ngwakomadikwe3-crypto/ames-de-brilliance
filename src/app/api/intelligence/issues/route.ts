import { NextResponse } from "next/server";
import { ensureReady, getDb as getDbSvc } from "@/lib/appwrite";
import { Query } from "node-appwrite";

export async function GET() {
  try {
    const db = await ensureReady().then(() => getDbSvc());
    const res = await db.listDocuments("ames", "report_issues", [
      Query.orderDesc("created_at"),
      Query.limit(100),
    ]);
    return NextResponse.json(res.documents.map((d: any) => ({
      id: d.$id,
      report_type: d.report_type,
      issue_label: d.issue_label,
      pdf_url: d.pdf_url,
      created_at: d.created_at,
    })));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
