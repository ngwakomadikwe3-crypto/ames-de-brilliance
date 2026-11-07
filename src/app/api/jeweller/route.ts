import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { signedInJeweller, staffLevel, listingFailure } from '@/lib/jeweller-access';
import { listProfiles, getProfile } from '@/lib/jeweller-store';
import { effectiveProfileStatus } from '@/lib/jeweller-profile';
import { listListings, createListing } from '@/lib/jeweller-listing-store';
import { newListing } from '@/lib/jeweller-listing';
import { checkChatOrigin, readChatJson, privateHeaders, ChatError } from '@/lib/chat-security';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  try {
    const staff = req.nextUrl.searchParams.get('staff') === '1';
    const level = staffLevel(req);
    if (staff && !level) throw new ChatError(403, 'Staff access required.');
    const profile = staff ? null : await signedInJeweller(req);
    const listings = (await listListings()).filter(l => staff || l.jewellerId === profile!.id);
    // Staff post pieces on behalf of verified jewellers: the dashboard lists them as makers.
    const jewellers = staff ? (await listProfiles()).filter(p => effectiveProfileStatus(p) === 'verified').map(p => ({ id: p.id, businessName: p.businessName })) : undefined;
    return NextResponse.json({ listings, role: level || 'jeweller', jewellers, profile: profile ? { id: profile.id, businessName: profile.businessName } : null }, { headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
export async function POST(req: NextRequest) {
  try {
    checkChatOrigin(req); const body = await readChatJson(req);
    if (staffLevel(req)) {
      // Staff create a listing for the verified jeweller who made the piece.
      const { jewellerId, ...input } = body as { jewellerId?: unknown };
      const maker = await getProfile(String(jewellerId || ''));
      if (effectiveProfileStatus(maker) !== 'verified') throw new ChatError(400, 'Choose a verified jeweller as the maker.');
      return NextResponse.json(await createListing(newListing(randomUUID(), maker.id, input)), { status: 201, headers: privateHeaders });
    }
    const profile = await signedInJeweller(req);
    if ((await listListings()).filter(l => l.jewellerId === profile.id && l.status !== 'published').length >= 30) throw new ChatError(400, 'You already have 30 unpublished listings. Contact AMES staff.');
    return NextResponse.json(await createListing(newListing(randomUUID(), profile.id, body)), { status: 201, headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
