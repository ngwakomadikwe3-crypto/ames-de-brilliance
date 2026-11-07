import { NextRequest, NextResponse } from 'next/server';
import { jewelryOwnerGuard } from '@/lib/jewelry-auth';
import { checkChatOrigin, readChatJson } from '@/lib/chat-security';
import { mutateProfile } from '@/lib/jeweller-store';
import { recordChange, effectiveProfileStatus } from '@/lib/jeweller-profile';
import { createInvite } from '@/lib/jeweller-invite';
import { sendJewellerInvite } from '@/lib/email';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

/** Staff: send a verified jeweller a one-time link to their studio login. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = jewelryOwnerGuard(request); if (denied) return denied;
  try {
    checkChatOrigin(request); const body = await readChatJson(request);
    if (!Number.isInteger(body.version)) throw new Error('Reload the profile before sending an invite');
    let token = '';
    const profile = await mutateProfile((await params).id, body.version as number, current => {
      if (effectiveProfileStatus(current) !== 'verified') throw new Error('Verify the jeweller profile before inviting them');
      if (!current.email) throw new Error('Add the jeweller’s email address to the profile first');
      const invite = createInvite(current.id, current.email); token = invite.token;
      return recordChange(current, { invite: invite.record }, 'invite_sent', `Studio invite created for ${current.email}`);
    });
    const url = `${request.nextUrl.origin}/jeweller/invite?token=${encodeURIComponent(token)}`;
    const emailed = await sendJewellerInvite(profile.email, profile.businessName, url, profile.invite!.expires);
    return NextResponse.json({ profile, url, emailed }, { headers });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not create the invite' }, { status: 400, headers }); }
}
