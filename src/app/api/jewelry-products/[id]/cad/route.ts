import { hasHostedCad, hostedCad } from '@/lib/cad-service';
import { NextRequest, NextResponse } from "next/server";
import { jewelryOwnerGuard } from "@/lib/jewelry-auth";
import { getJewelryProduct } from "@/lib/jewelry-products";
import { getStorage, JEWELRY_SOURCES_BUCKET } from "@/lib/appwrite";
import { consumeQuota, chatFailure, ChatError } from '@/lib/chat-security';
import { listJobs, queueJob, requestSchema, workerHealth } from "../../../../../../scripts/cad/store.mjs";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  const denied = jewelryOwnerGuard(request); if (denied) return denied;
  const product = await getJewelryProduct((await params).id);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    if (hasHostedCad()) return NextResponse.json(await (await hostedCad(`/products/${encodeURIComponent(product.id)}/jobs`)).json(), { headers });
    if (process.env.VERCEL) return NextResponse.json({ jobs: [], worker: { online: false }, message: 'Hosted CAD service is not configured' }, { headers });
    return NextResponse.json({ jobs: await listJobs(product.id), worker: await workerHealth() }, { headers });
  } catch { return NextResponse.json({ error: 'Hosted CAD is unavailable' }, { status: 503, headers }); }
}
export async function POST(request: NextRequest, { params }: Context) {
  const denied = jewelryOwnerGuard(request); if (denied) return denied;
  const product = await getJewelryProduct((await params).id);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await consumeQuota(`cad:${request.cookies.get('adb_session')?.value || 'staff'}`, 5);
    const input = requestSchema.parse(await request.json());
    const source = product.source_files.find(file => file.fileId === input.sourceFileId && file.kind === "source");
    if (!source) return NextResponse.json({ error: "Upload the source to this product before converting it" }, { status: 400 });
    if (hasHostedCad()) return NextResponse.json(await (await hostedCad(`/products/${encodeURIComponent(product.id)}/jobs`, { method: 'POST', body: JSON.stringify({ product, source, input }) })).json(), { status: 202, headers });
    if (process.env.VERCEL) return NextResponse.json({ error: 'Hosted CAD service is not configured' }, { status: 503, headers });
    if (!(await workerHealth()).online) return NextResponse.json({ error: "The CAD conversion worker is offline. Start it before generating a preview." }, { status: 503 });
    if (source.bytes > 100 * 1024 * 1024) throw new Error("Conversion limit is 100 MB");
    const bytes = Buffer.from(await getStorage().getFileDownload({ bucketId: JEWELRY_SOURCES_BUCKET, fileId: input.sourceFileId }));
    return NextResponse.json(await queueJob(product, source, bytes, input), { status: 202, headers });
  } catch (error) {
    if (error instanceof ChatError) return chatFailure(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not queue preview" }, { status: 400 });
  }
}
