import { NextResponse } from 'next/server';
import { publicStoneCatalogue } from '@/lib/stone-review-store';
import { roughStonesOnly } from '@/lib/rough-stone-catalogue';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return NextResponse.json({ items: roughStonesOnly(await publicStoneCatalogue()) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'The rough gemstone catalogue is unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
