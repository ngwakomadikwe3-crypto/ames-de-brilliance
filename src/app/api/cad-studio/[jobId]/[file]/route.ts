import { NextRequest, NextResponse } from 'next/server';
import { jewelryOwnerGuard } from '@/lib/jewelry-auth';
import { buildStudioPack, getStudioJob, readStudioArtifact } from '../../../../../../scripts/cad/studio.mjs';
import { hasHostedCad, hostedCad } from '@/lib/cad-service';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string; file: string }> }) {
  const denied = jewelryOwnerGuard(request); if (denied) return denied;
  if (process.env.VERCEL && !hasHostedCad()) return NextResponse.json({ error: 'Local CAD artifacts are available on your workstation.' }, { status: 503 });
  const { jobId, file } = await params;
  if (!['preview.glb', 'poster.png', 'result.json', 'asset-pack.zip'].includes(file)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    if (!/^[a-f0-9-]{36}$/.test(jobId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (hasHostedCad()) {
      const response = await hostedCad(`/studio/jobs/${jobId}/${file}`);
      return new NextResponse(response.body, { headers: { 'Content-Type': file.endsWith('.zip') ? 'application/zip' : file.endsWith('.glb') ? 'model/gltf-binary' : file.endsWith('.png') ? 'image/png' : 'application/json', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    const job = await getStudioJob(jobId);
    const bytes = file === 'asset-pack.zip'
      ? buildStudioPack(job, await readStudioArtifact(job, 'preview.glb'), await readStudioArtifact(job, 'poster.png'))
      : await readStudioArtifact(job, file);
    return new NextResponse(new Uint8Array(bytes), { headers: {
      'Content-Type': file.endsWith('.zip') ? 'application/zip' : file.endsWith('.glb') ? 'model/gltf-binary' : file.endsWith('.png') ? 'image/png' : 'application/json',
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      ...(file.endsWith('.zip') ? { 'Content-Disposition': `attachment; filename="${job.assetId}-asset-pack.zip"` } : {}),
    } });
  } catch { return NextResponse.json({ error: 'Private CAD artifact unavailable' }, { status: 404 }); }
}
