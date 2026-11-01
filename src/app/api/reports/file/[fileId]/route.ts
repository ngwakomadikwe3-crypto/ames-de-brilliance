import { NextRequest, NextResponse } from "next/server";
import { ensureReady, getStorage, REPORTS_BUCKET } from "@/lib/appwrite";
import { serveStorageFile } from "@/lib/file-proxy";
import { verifyReportShareLink } from "@/lib/report-share";
import { sessionTokenFromCookieHeader, verifySession } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Read proxy for generated report PDFs — STAFF-ONLY by default (owner
 * decision 2026-10-31; supersedes the pre-lockdown public behaviour).
 *
 * Access is granted by either:
 *   1. a valid staff session cookie, or
 *   2. a short-lived signed share link (?expires=&sig=) minted by a staff
 *      member via POST /api/reports/share.
 *
 * The bucket id is a server-side constant; the file id is validated in
 * serveStorageFile before any storage call (see src/lib/file-proxy.ts).
 * Responses are private, no-store: a shared link is not a cacheable asset.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await context.params;

  const token = sessionTokenFromCookieHeader(req.headers.get("cookie"));
  const staff = !!token && (await verifySession(token));
  const shared = verifyReportShareLink(
    fileId,
    req.nextUrl.searchParams.get("expires") ?? "",
    req.nextUrl.searchParams.get("sig") ?? ""
  );
  if (!staff && !shared) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureReady();
  return serveStorageFile({
    storage: getStorage(),
    bucketId: REPORTS_BUCKET,
    fileId,
    contentType: "application/pdf",
    inlineFilename: true,
    cacheControl: "private, no-store",
  });
}
