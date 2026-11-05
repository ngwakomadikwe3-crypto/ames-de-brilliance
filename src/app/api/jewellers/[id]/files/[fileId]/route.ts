import { NextRequest, NextResponse } from 'next/server';
import { jewelryOwnerGuard } from '@/lib/jewelry-auth';
import { checkChatOrigin, readChatJson } from '@/lib/chat-security';
import { readProfileFile, removeProfileFile } from '@/lib/jeweller-store';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string; fileId: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  const denied = jewelryOwnerGuard(request); if (denied) return denied;
  try {
    const { id, fileId } = await params; const { bytes, file } = await readProfileFile(id, fileId);
    return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': file.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie',
      ...(file.mime === 'application/pdf' ? { 'Content-Disposition': `attachment; filename="evidence-${file.id}.pdf"` } : {}) } });
  } catch { return NextResponse.json({ error: 'Private document unavailable' }, { status: 404 }); }
}
export async function DELETE(request: NextRequest, { params }: Context) {
  const denied = jewelryOwnerGuard(request); if (denied) return denied;
  try {
    checkChatOrigin(request); const { id, fileId } = await params; const body = await readChatJson(request);
    if (!Number.isInteger(body.version)) throw new Error('Reload the profile before removing a file');
    return NextResponse.json(await removeProfileFile(id, body.version, fileId), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not remove document' }, { status: 400 }); }
}
