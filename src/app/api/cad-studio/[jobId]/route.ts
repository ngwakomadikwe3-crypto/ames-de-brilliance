import { NextRequest, NextResponse } from 'next/server';
import { jewelryOwnerGuard } from '@/lib/jewelry-auth';
import { checkChatOrigin } from '@/lib/chat-security';
import { hasHostedCad, hostedCad } from '@/lib/cad-service';
import { rerenderStudioJob } from '../../../../../scripts/cad/studio.mjs';
import { workerHealth } from '../../../../../scripts/cad/store.mjs';
export const runtime = 'nodejs';
export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const denied = jewelryOwnerGuard(request); if (denied) return denied;
  try {
    checkChatOrigin(request);
    const { jobId } = await params;
    if (!/^[a-f0-9-]{36}$/.test(jobId)) return NextResponse.json({ error: 'Invalid design' }, { status: 400 });
    if (hasHostedCad()) return NextResponse.json(await (await hostedCad(`/studio/jobs/${jobId}`, { method: 'POST' })).json(), { status: 202 });
    if (process.env.VERCEL || !(await workerHealth()).online) return NextResponse.json({ error: 'The Blender rendering service is offline.' }, { status: 503 });
    return NextResponse.json(await rerenderStudioJob(jobId), { status: 202 });
  } catch { return NextResponse.json({ error: 'Could not re-render this design. Check the worker and retained source.' }, { status: 400 }); }
}
