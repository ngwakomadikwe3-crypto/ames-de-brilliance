import { NextRequest, NextResponse } from 'next/server';
import { checkChatOrigin, readChatJson, privateHeaders, ChatError, chatFailure } from '@/lib/chat-security';
import { customerSession } from '@/lib/customer-session';
import { getProfile, listProfiles, mutateProfile } from '@/lib/jeweller-store';
import { recordChange, effectiveProfileStatus } from '@/lib/jeweller-profile';
import { readInvite, maskEmail } from '@/lib/jeweller-invite';
export const runtime = 'nodejs';

/** Jeweller: accept a studio invite with the AMES account that uses the invited email. */
export async function POST(req: NextRequest) {
  try {
    checkChatOrigin(req); const body = await readChatJson(req), invite = readInvite(body.token);
    const { user } = await customerSession(req, true);
    if ((await listProfiles()).some(p => p.portalUserId === user.$id && p.id !== invite.profileId)) throw new ChatError(409, 'This AMES account is already linked to another business. Sign in with a different account.');
    const current = await getProfile(invite.profileId);
    const profile = await mutateProfile(invite.profileId, current.version, p => {
      if (effectiveProfileStatus(p) !== 'verified') throw new ChatError(403, 'This business is not verified at the moment. Contact AMES.');
      if (!p.invite || p.invite.nonceHash !== invite.nonceHash) throw new ChatError(410, 'This invite was replaced or already used. Ask AMES for a new link.');
      if (user.email.trim().toLowerCase() !== p.invite.email) throw new ChatError(403, `Sign in with the invited email (${maskEmail(p.invite.email)}) to accept this invite.`);
      return recordChange(p, { portalUserId: user.$id, invite: undefined }, 'invite_accepted', 'Jeweller accepted the studio invite', new Date().toISOString(), 'jeweller');
    });
    return NextResponse.json({ ok: true, businessName: profile.businessName }, { headers: privateHeaders });
  } catch (error) { return chatFailure(error); }
}
