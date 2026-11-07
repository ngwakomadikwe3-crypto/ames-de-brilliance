// Staff: every inventory stone with its 3D status, for the Stone 3D page.
import { NextRequest, NextResponse } from 'next/server';
import { getAllStones } from '@/lib/db';
import { readStone3d, stone3dSummary } from '@/lib/stone-3d';
import { staffLevel, listingFailure } from '@/lib/jeweller-access';
import { privateHeaders, ChatError } from '@/lib/chat-security';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  try {
    const role = staffLevel(req); if (!role) throw new ChatError(403, 'Staff access required.');
    const stones = (await getAllStones()) as Record<string, unknown>[];
    const rows = await Promise.all(stones.filter(s => s.status !== 'Sold').map(async s => ({
      id: String(s.id), ref: String(s.ref), stone_type: String(s.stone_type || ''), shape: String(s.shape || ''), carat: Number(s.carat) || 0, color: String(s.color || ''),
      clarity: String(s.clarity || ''), category: String(s.category || ''), crystal_form: String(s.crystal_form || ''), status: String(s.status || ''), source: String(s.source || ''),
      photo: String(s.photo || '').split('|').find(u => u.startsWith('http')) || '', threeD: stone3dSummary(await readStone3d(String(s.id))) })));
    return NextResponse.json({ role, stones: rows }, { headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
