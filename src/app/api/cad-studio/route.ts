import { NextRequest, NextResponse } from 'next/server';
import { jewelryOwnerGuard } from '@/lib/jewelry-auth';
import { checkChatOrigin } from '@/lib/chat-security';
import { formats, workerHealth } from '../../../../scripts/cad/store.mjs';
import { listStudioJobs, queueStudioUpload, studioInput } from '../../../../scripts/cad/studio.mjs';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: NextRequest) {
  const denied = jewelryOwnerGuard(request); if (denied) return denied;
  if (process.env.VERCEL) return NextResponse.json({ error: 'CAD Assets runs on your local workstation. Cloud worker connection is not configured for this studio.' }, { status: 503, headers });
  try { return NextResponse.json({ jobs: await listStudioJobs(), worker: await workerHealth(), formats, maxBytes: 100 * 1024 * 1024 }, { headers }); }
  catch { return NextResponse.json({ error: 'The local CAD queue is unavailable' }, { status: 503, headers }); }
}
export async function POST(request: NextRequest) {
  const denied = jewelryOwnerGuard(request); if (denied) return denied;
  if (process.env.VERCEL) return NextResponse.json({ error: 'Open CAD Assets on your local workstation to upload and convert files.' }, { status: 503, headers });
  try {
    checkChatOrigin(request);
    if (!(await workerHealth()).online) return NextResponse.json({ error: 'Start the local conversion worker before uploading.' }, { status: 503, headers });
    if (Number(request.headers.get('content-length')) > 101 * 1024 * 1024) return NextResponse.json({ error: 'The upload limit is 100 MB.' }, { status: 413, headers });
    const body = await request.formData();
    const source = body.get('source');
    if (!(source instanceof File) || !source.size || source.size > 100 * 1024 * 1024) return NextResponse.json({ error: 'Choose one GLB, OBJ, STL or FBX file, up to 100 MB.' }, { status: 400, headers });
    const input = studioInput.parse({ name: body.get('name'), category: body.get('category'), units: body.get('units') || 'unknown' });
    const job = await queueStudioUpload(input, source.name, Buffer.from(await source.arrayBuffer()));
    return NextResponse.json(job, { status: 202, headers });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: 400, headers }); }
}
