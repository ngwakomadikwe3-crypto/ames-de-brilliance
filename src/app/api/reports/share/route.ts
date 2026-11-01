import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FILE_ID_RE } from "@/lib/file-proxy";
import { mintReportShareLink, reportShareTtlSeconds } from "@/lib/report-share";
import { sessionTokenFromCookieHeader, verifySession } from "@/lib/session";

export const runtime = "nodejs";

const ShareSchema = z.object({
  fileId: z.string().regex(FILE_ID_RE),
  ttlSeconds: z.number().int().min(60).max(86400).optional(),
});

/**
 * Mint a short-lived signed share link for one report PDF. Staff only
 * (owner decision 2026-10-31: reports default staff-only, sharing happens
 * through expiring links). This endpoint returns the link only — never file
 * bytes. Default TTL: REPORT_SHARE_TTL_SECONDS or 15 minutes.
 */
export async function POST(req: NextRequest) {
  const token = sessionTokenFromCookieHeader(req.headers.get("cookie"));
  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = ShareSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  const ttl = parsed.data.ttlSeconds ?? reportShareTtlSeconds();
  const link = mintReportShareLink(parsed.data.fileId, Date.now(), ttl);
  if (!link) {
    return NextResponse.json({ error: "sharing_unavailable" }, { status: 500 });
  }

  const path = `/api/reports/file/${parsed.data.fileId}?expires=${link.expires}&sig=${link.sig}`;
  return NextResponse.json({
    ok: true,
    path,
    url: new URL(path, req.nextUrl.origin).toString(),
    expiresAt: new Date(link.expires * 1000).toISOString(),
  });
}
