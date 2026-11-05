import { NextRequest, NextResponse } from 'next/server';
import { customerSession } from '@/lib/customer-session';
import { ownBusiness, selfProfile } from '@/lib/auctioneer-onboarding';
import { createSelfProfile, mutateProfile } from '@/lib/auctioneer-store';
import { editProfile, reviewProfile } from '@/lib/auctioneer-profile';
import { listingFailure } from '@/lib/jeweller-access';
import { checkChatOrigin, readChatJson, privateHeaders } from '@/lib/chat-security';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  try { const { user, profile } = await ownBusiness(req, false); return NextResponse.json({ account: { id: user.$id, name: user.name, email: user.email, verified: user.emailVerification }, profile: profile ? selfProfile(profile) : null }, { headers: privateHeaders }); }
  catch (e) { return listingFailure(e); }
}
export async function POST(req: NextRequest) {
  try {
    checkChatOrigin(req); const body = await readChatJson(req), { user } = await customerSession(req, true);
    if (body.action === 'create') return NextResponse.json({ profile: selfProfile(await createSelfProfile(user.$id, body.details)) }, { status: 201, headers: privateHeaders });
    const { profile } = await ownBusiness(req); if (!profile) throw new Error('Create your business profile first');
    const actor = `account:${user.$id}`;
    const updated = await mutateProfile(profile.id, Number(body.version), async current => {
      if (current.portalUserId !== user.$id) throw new Error('Business profile ownership changed');
      if (body.action === 'save') {
        if (current.status === 'submitted') throw new Error('Wait for the staff review or a revision request before editing');
        if (current.status === 'verified' && body.confirmReverification !== true) throw new Error('Confirm that changed business details require renewed verification');
        return editProfile(current, body.details, actor);
      }
      if (body.action === 'submit') return reviewProfile(current, { action: 'submit' }, new Date().toISOString(), actor);
      throw new Error('Only auctioneer details and submission can be changed here');
    });
    return NextResponse.json({ profile: selfProfile(updated) }, { headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
