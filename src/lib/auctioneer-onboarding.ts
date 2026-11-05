import type { NextRequest } from 'next/server';
import { customerSession } from './customer-session';
import { listProfiles } from './auctioneer-store';
import { profileInput, profileGaps, effectiveProfileStatus, type AuctioneerProfile } from './auctioneer-profile';
import { ChatError } from './chat-security';
export async function ownBusiness(req: NextRequest, verifiedEmail = true) {
  const { user } = await customerSession(req, verifiedEmail);
  const profiles = (await listProfiles()).filter(p => p.portalUserId === user.$id);
  if (profiles.length > 1) throw new ChatError(409, 'Ask staff to resolve duplicate business profiles.');
  return { user, profile: profiles[0] || null };
}
export function selfProfile(profile: AuctioneerProfile) {
  return { id: profile.id, version: profile.version, details: profileInput.parse(Object.fromEntries(Object.keys(profileInput.shape).map(key => [key, profile[key as keyof AuctioneerProfile]]))), status: profile.status,
    effectiveStatus: effectiveProfileStatus(profile), verifiedUntil: profile.verifiedUntil, files: profile.files,
    gaps: profileGaps(profile),
    feedback: [...profile.audit].reverse().find(a => ['request_revision', 'suspend'].includes(a.action))?.reason || '' };
}
