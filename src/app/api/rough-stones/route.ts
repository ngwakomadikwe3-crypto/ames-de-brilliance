import { NextResponse } from 'next/server';
import { publicStoneCatalogue } from '@/lib/stone-review-store';
import { getStoneById } from '@/lib/db';
import { readStone3d } from '@/lib/stone-3d';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Published Catalogue Room stones (rough and polished), with the dealer's photo and the approved 3D. */
export async function GET() {
  try {
    const items = await Promise.all((await publicStoneCatalogue()).map(async item => {
      const [stone, three] = await Promise.all([getStoneById(item.stoneId).catch(() => null), readStone3d(item.stoneId).catch(() => null)]);
      const photo = String(stone?.photo || '').split('|').find(u => u.startsWith('https://')) || '';
      const approved = three?.data.approved && three.data.model?.complete && three.data.poster?.complete;
      const v = approved ? three!.data.model!.sha256.slice(0, 12) : '';
      return { ...item, photo, model: approved ? `/api/stone-3d/${item.stoneId}/model.glb?v=${v}` : '', poster: approved ? `/api/stone-3d/${item.stoneId}/poster.webp?v=${three!.data.poster!.sha256.slice(0, 12)}` : '',
        modelNote: approved ? three!.data.note : '' };
    }));
    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'The stone catalogue is unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
