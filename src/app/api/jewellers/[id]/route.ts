import { NextRequest, NextResponse } from 'next/server';
import { jewelryOwnerGuard } from '@/lib/jewelry-auth';
import { checkChatOrigin, readChatJson } from '@/lib/chat-security';
import { getProfile, mutateProfile, listProfiles } from '@/lib/jeweller-store';
import { editProfile, reviewProfile, recordChange, effectiveProfileStatus } from '@/lib/jeweller-profile';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  const denied = jewelryOwnerGuard(request); if (denied) return denied;
  try { return NextResponse.json(await getProfile((await params).id), { headers }); }
  catch { return NextResponse.json({ error: 'Profile unavailable' }, { status: 404, headers }); }
}
export async function PATCH(request: NextRequest, { params }: Context) {
  const denied = jewelryOwnerGuard(request); if (denied) return denied;
  try {
    checkChatOrigin(request); const body = await readChatJson(request);
    if (!Number.isInteger(body.version)) throw new Error('Reload the profile before saving');
    if ('portalAccountId' in body) {
      if (typeof body.portalAccountId !== 'string' || (body.portalAccountId && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(body.portalAccountId))) throw new Error('Enter a valid AMES account ID');
      const id = (await params).id;
      if (body.portalAccountId && (await listProfiles()).some(p => p.id !== id && p.portalUserId === body.portalAccountId)) throw new Error('This account is already linked to another jeweller');
      const profile = await mutateProfile(id, body.version, current => {
        if (body.portalAccountId && effectiveProfileStatus(current) !== 'verified') throw new Error('Verify the jeweller profile before enabling portal access');
        return recordChange(current, { portalUserId: body.portalAccountId as string }, 'portal_access_changed', body.portalAccountId ? 'Staff linked the AMES account' : 'Portal access revoked');
      });
      return NextResponse.json(profile, { headers });
    }
    const profile = await mutateProfile((await params).id, body.version, current => body.review ? reviewProfile(current, body.review) : editProfile(current, body.details));
    return NextResponse.json(profile, { headers });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not update profile' }, { status: 400, headers }); }
}
