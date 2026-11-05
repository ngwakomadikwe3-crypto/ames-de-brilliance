import { NextRequest, NextResponse } from 'next/server';
import { ownBusiness, selfProfile } from '@/lib/jeweller-onboarding';
import { readProfileFile, removeProfileFile } from '@/lib/jeweller-store';
import { checkChatOrigin, privateHeaders, readChatJson } from '@/lib/chat-security';
import { listingFailure } from '@/lib/jeweller-access';
export const runtime = 'nodejs';
type Context = { params: Promise<{ fileId: string }> };
export async function GET(req: NextRequest, { params }: Context) {
  try {
    const { profile } = await ownBusiness(req, false); if (!profile) throw new Error('Business profile not found');
    const { bytes, file } = await readProfileFile(profile.id, (await params).fileId);
    return new Response(new Uint8Array(bytes), { headers: { ...privateHeaders, 'Content-Type': file.mime, 'Content-Disposition': `attachment; filename="${file.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`, 'X-Content-Type-Options': 'nosniff' } });
  } catch (e) { return listingFailure(e); }
}
export async function DELETE(req: NextRequest, { params }: Context) {
  try {
    checkChatOrigin(req); const { user, profile } = await ownBusiness(req); if (!profile) throw new Error('Business profile not found');
    const body = await readChatJson(req);
    if (profile.status === 'submitted' || (profile.status === 'verified' && body.confirmReverification !== true)) throw new Error('Changing reviewed evidence requires renewed verification');
    return NextResponse.json({ profile: selfProfile(await removeProfileFile(profile.id, Number(body.version), (await params).fileId, `account:${user.$id}`)) }, { headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
