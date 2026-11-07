import { z } from 'zod';
import { customerSession } from './customer-session';
import type { NextRequest } from 'next/server';
import { getSessionRole } from '@/lib/staff-session';
import { ChatError, privateHeaders } from './chat-security';
import { NextResponse } from 'next/server';
import { listProfiles, getProfile } from './jeweller-store';
import { effectiveProfileStatus } from './jeweller-profile';
import type { JewellerListing } from './jeweller-listing';

export const isStaffOwner = (req: NextRequest) => getSessionRole(req.headers.get('cookie') || undefined) === 'owner';
/** Dashboard sign-in level: the Owner approves and publishes; other staff post CAD designs for approval. */
export function staffLevel(req: NextRequest): 'owner' | 'staff' | null {
  const role = getSessionRole(req.headers.get('cookie') || undefined);
  return role === 'owner' ? 'owner' : role ? 'staff' : null;
}
export const isStaff = (req: NextRequest) => staffLevel(req) !== null;
export async function signedInJeweller(req: NextRequest) {
  const { user } = await customerSession(req, true);
  const profiles = (await listProfiles()).filter(p => p.portalUserId === user.$id);
  if (profiles.length !== 1 || effectiveProfileStatus(profiles[0]) !== 'verified') throw new ChatError(403, 'Staff must verify your jeweller profile and enable access for this account.');
  return profiles[0];
}
export async function listingAccess(req: NextRequest, listing: JewellerListing) {
  const level = staffLevel(req); if (level) return level;
  const profile = await signedInJeweller(req);
  if (listing.jewellerId !== profile.id) throw new ChatError(404, 'Listing not found.');
  return profile.id;
}
export async function verifiedListingProfile(listing: JewellerListing) {
  const profile = await getProfile(listing.jewellerId);
  if (effectiveProfileStatus(profile) !== 'verified') throw new ChatError(404, 'Listing unavailable.');
  return profile;
}
export function listingFailure(error: unknown) {
  const status = error instanceof ChatError ? error.status : (error as { code?: number }).code === 404 || (error as { code?: string }).code === 'ENOENT' ? 404 : 400;
  if ((error as { type?: string })?.type || (typeof (error as { code?: unknown })?.code === 'number' && !(error instanceof ChatError) && status !== 404)) return NextResponse.json({ error: 'Private listing storage is temporarily unavailable.' }, { status: 503, headers: privateHeaders });
  return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message || 'Check the listing details.' : error instanceof Error ? error.message : 'Listing request failed.' }, { status, headers: privateHeaders });
}
