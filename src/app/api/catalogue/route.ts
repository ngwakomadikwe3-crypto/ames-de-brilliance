import { NextResponse } from 'next/server';
import { listListings } from '@/lib/jeweller-listing-store';
import { verifiedListingProfile } from '@/lib/jeweller-access';
import { publicListing } from '@/lib/jeweller-listing';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const listings = (await listListings()).filter(l => l.status === 'published');
    const published = await Promise.all(listings.map(async l => {
      try { const p = await verifiedListingProfile(l); return publicListing(l, p.businessName, p.storefront?.published && p.storefront.rightsConfirmed ? p.storefront.slug : undefined); } catch { return null; }
    }));
    return NextResponse.json({ listings: published.filter(Boolean) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Jeweller listings are temporarily unavailable.' }, { status: 503 }); }
}
