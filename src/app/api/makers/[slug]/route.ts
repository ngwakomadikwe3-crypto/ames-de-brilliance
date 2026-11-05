import { NextResponse } from 'next/server';
import { publicStorefront } from '@/lib/public-storefront';
export const runtime = 'nodejs';
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try { return NextResponse.json((await publicStorefront((await params).slug)).data, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'Storefront is not available.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } }); }
}
