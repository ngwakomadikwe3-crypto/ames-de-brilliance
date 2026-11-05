import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { signedInJeweller, isStaffOwner, listingFailure } from '@/lib/jeweller-access';
import { listListings, createListing } from '@/lib/jeweller-listing-store';
import { newListing } from '@/lib/jeweller-listing';
import { checkChatOrigin, readChatJson, privateHeaders, ChatError } from '@/lib/chat-security';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  try {
    const staff = req.nextUrl.searchParams.get('staff') === '1';
    if (staff && !isStaffOwner(req)) throw new ChatError(403, 'Staff access required.');
    const profile = staff ? null : await signedInJeweller(req);
    const listings = (await listListings()).filter(l => staff || l.jewellerId === profile!.id);
    return NextResponse.json({ listings, profile: profile ? { id: profile.id, businessName: profile.businessName } : null }, { headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
export async function POST(req: NextRequest) {
  try {
    checkChatOrigin(req); const profile = await signedInJeweller(req); const body = await readChatJson(req);
    if ((await listListings()).filter(l => l.jewellerId === profile.id && l.status !== 'published').length >= 30) throw new ChatError(400, 'You already have 30 unpublished listings. Contact AMES staff.');
    return NextResponse.json(await createListing(newListing(randomUUID(), profile.id, body)), { status: 201, headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
