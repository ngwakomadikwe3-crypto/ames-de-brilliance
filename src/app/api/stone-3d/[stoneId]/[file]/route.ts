// Stone 3D files. The scan stays private to staff; the model and picture are public once the Owner has
// approved the 3D and the stone itself is published in the Catalogue Room.
import { NextRequest, NextResponse } from 'next/server';
import { readStone3d } from '@/lib/stone-3d';
import { reviewDetail } from '@/lib/stone-review-store';
import { fileResponse } from '@/lib/jeweller-listing-files';
import { staffLevel } from '@/lib/jeweller-access';
export const runtime = 'nodejs';
type Context = { params: Promise<{ stoneId: string; file: string }> };
export async function GET(req: NextRequest, ctx: Context) {
  const { stoneId, file } = await ctx.params, field = file === 'scan' ? 'scan' : file === 'model.glb' ? 'model' : file === 'poster.webp' ? 'poster' : null;
  const missing = () => NextResponse.json({ error: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  if (!field) return missing();
  try {
    const record = await readStone3d(stoneId), stored = record?.data[field];
    if (!record || !stored?.complete) return missing();
    if (staffLevel(req)) return fileResponse(stored);
    if (field === 'scan' || !record.data.approved || !(await reviewDetail(stoneId)).published) return missing();
    return fileResponse(stored, true);
  } catch { return missing(); }
}
