import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { jewelryOwnerGuard } from '@/lib/jewelry-auth';
import { checkChatOrigin } from '@/lib/chat-security';
import { fileKinds } from '@/lib/auctioneer-profile';
import { addProfileFile } from '@/lib/auctioneer-store';
export const runtime = 'nodejs';
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = jewelryOwnerGuard(request); if (denied) return denied;
  try {
    checkChatOrigin(request);
    if (Number(request.headers.get('content-length')) > 5 * 1024 * 1024) throw new Error('Maximum 4 MB per file');
    const body = await request.formData(), file = body.get('file');
    if (!(file instanceof File)) throw new Error('Select a file');
    const kind = z.enum(fileKinds).parse(body.get('kind'));
    const profile = await addProfileFile((await params).id, z.coerce.number().int().positive().parse(body.get('version')), file, kind, String(body.get('expiresOn') || ''));
    return NextResponse.json(profile, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Upload failed' }, { status: 400 }); }
}
