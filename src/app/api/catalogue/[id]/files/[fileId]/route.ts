import { NextResponse } from 'next/server';
import { getListing } from '@/lib/jeweller-listing-store';
import { verifiedListingProfile } from '@/lib/jeweller-access';
import { publicListing } from '@/lib/jeweller-listing';
import { fileResponse } from '@/lib/jeweller-listing-files';
export const runtime = 'nodejs';
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  try {
    const { id, fileId } = await params, l = await getListing(id); publicListing(l, (await verifiedListingProfile(l)).businessName);
    const file = l.files.find(f => f.id === fileId && f.complete && ['preview', 'poster'].includes(f.kind));
    if (!file) throw new Error('Not a public artifact');
    return fileResponse(file, true);
  } catch { return NextResponse.json({ error: 'File unavailable.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } }); }
}
