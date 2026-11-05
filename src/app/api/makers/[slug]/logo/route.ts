import { NextResponse } from 'next/server';
import { publicStorefront } from '@/lib/public-storefront';
import { readProfileFile } from '@/lib/jeweller-store';
export const runtime = 'nodejs';
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { profile } = await publicStorefront((await params).slug), id = profile.storefront!.logoId;
    const entry = profile.files.find(f => f.id === id && ['portrait', 'portfolio'].includes(f.kind) && f.mime.startsWith('image/')); if (!entry) throw new Error('Logo not found');
    const { bytes, file } = await readProfileFile(profile.id, id);
    return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': file.mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return NextResponse.json({ error: 'Image unavailable.' }, { status: 404 }); }
}
