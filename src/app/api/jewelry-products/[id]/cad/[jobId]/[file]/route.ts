import { hasHostedCad, hostedCad } from '@/lib/cad-service';
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { jewelryOwnerGuard } from "@/lib/jewelry-auth";
import { getJewelryProduct } from "@/lib/jewelry-products";
import { readJob, jobDir, sha256 } from "../../../../../../../../scripts/cad/store.mjs";
export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; jobId: string; file: string }> }) {
  const denied = jewelryOwnerGuard(request); if (denied) return denied;
  const { id, jobId, file } = await params;
  if (!["preview.glb", "poster.png", "result.json"].includes(file)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const product = await getJewelryProduct(id);
    const remotePath = `/products/${encodeURIComponent(id)}/jobs/${encodeURIComponent(jobId)}`;
    if (!hasHostedCad() && process.env.VERCEL) return NextResponse.json({ error: 'Hosted CAD is not configured' }, { status: 503 });
    const job = hasHostedCad() ? await (await hostedCad(remotePath)).json() : await readJob(jobId);
    if (!product || job.productId !== product.id || !product.source_hashes.includes(job.sourceSha256) || job.status !== "ready") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const bytes = hasHostedCad() ? Buffer.from(await (await hostedCad(`${remotePath}/${file}`)).arrayBuffer()) : await readFile(join(jobDir(jobId), file));
    const expected = file === "preview.glb" ? job.result.previewSha256 : file === "poster.png" ? job.result.posterSha256 : null;
    if (expected && sha256(bytes) !== expected) throw new Error("Preview checksum mismatch");
    return new NextResponse(new Uint8Array(bytes), { headers: {
      "Content-Type": file.endsWith(".glb") ? "model/gltf-binary" : file.endsWith(".png") ? "image/png" : "application/json",
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch { return NextResponse.json({ error: "Private preview unavailable" }, { status: 404 }); }
}
