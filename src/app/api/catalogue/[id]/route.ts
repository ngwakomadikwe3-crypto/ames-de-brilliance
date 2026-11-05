import { NextResponse } from 'next/server';
import { getListing } from '@/lib/jeweller-listing-store';
import { verifiedListingProfile } from '@/lib/jeweller-access';
import { publicListing } from '@/lib/jeweller-listing';
export const runtime = 'nodejs';
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const l = await getListing((await params).id), p = await verifiedListingProfile(l); return NextResponse.json(publicListing(l, p.businessName, p.storefront?.published && p.storefront.rightsConfirmed ? p.storefront.slug : undefined), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'Listing unavailable.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } }); }
}
