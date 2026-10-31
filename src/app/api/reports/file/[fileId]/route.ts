import { NextRequest, NextResponse } from "next/server";
import { ensureReady, getStorage, REPORTS_BUCKET } from "@/lib/appwrite";

export const runtime = "nodejs";

const FILE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/;

/**
 * Read proxy for generated report PDFs. Published report issues were publicly
 * downloadable before the lockdown (public bucket), so this proxy stays public
 * to preserve that behavior exactly. TODO(owner): paid/bespoke reports may
 * need entitlement checks — flagged as a Phase 4 decision.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await context.params;
  if (!FILE_ID_RE.test(fileId)) {
    return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
  }
  try {
    await ensureReady();
    const storage = getStorage();
    const meta = await storage.getFile({ bucketId: REPORTS_BUCKET, fileId });
    const view = await storage.getFileView({ bucketId: REPORTS_BUCKET, fileId });
    const bytes = new Uint8Array(view);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `inline; filename="${(meta.name || "report.pdf").replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
