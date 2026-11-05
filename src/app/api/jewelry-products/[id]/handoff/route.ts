import { NextRequest, NextResponse } from "next/server";
import { jewelryOwnerGuard } from "@/lib/jewelry-auth";
import { getJewelryProduct } from "@/lib/jewelry-products";
import { listJobs } from "../../../../../../scripts/cad/store.mjs";
import { handoffSourceDescriptor } from "@/lib/jewelry-workflow";
import { hasHostedCad, hostedCad } from '@/lib/cad-service';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = jewelryOwnerGuard(request);
  if (denied) return denied;
  const product = await getJewelryProduct((await params).id);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let jobs: Awaited<ReturnType<typeof listJobs>>;
  try { jobs = hasHostedCad() ? (await (await hostedCad(`/products/${encodeURIComponent(product.id)}/jobs`)).json()).jobs : process.env.VERCEL ? [] : await listJobs(product.id); }
  catch { return NextResponse.json({ error: 'Hosted CAD handoff is unavailable' }, { status: 503 }); }
  return NextResponse.json({
    schemaVersion: "ames.jewelry-handoff/1",
    productId: product.id, traderId: product.trader_id,
    assetId: product.asset_id, name: product.name, category: product.category,
    workflowStatus: product.workflow_status,
    sourceMode: product.source_mode,
    sources: product.source_files.map(file => handoffSourceDescriptor(product.id, file, product.source_mode)),
    engineProcessing: "operator_handoff_required",
    cadPreviews: jobs.filter(job => job.status === "ready").map(job => ({
      jobId: job.id, sourceSha256: job.sourceSha256, units: job.units, assignments: job.assignments,
      preview: `/api/jewelry-products/${product.id}/cad/${job.id}/preview.glb`,
      poster: `/api/jewelry-products/${product.id}/cad/${job.id}/poster.png`,
      report: `/api/jewelry-products/${product.id}/cad/${job.id}/result.json`,
      previewSha256: job.result.previewSha256, publicationStatus: "review",
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
