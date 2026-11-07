// Staff convert a stone's 3D and send it for approval; the Owner approves or withdraws it.
import { NextRequest, NextResponse } from 'next/server';
import { getStoneById } from '@/lib/db';
import { readStone3d, stone3dSummary, startStoneUpload, addStonePart, saveStoneModel, decideStoneModel, type Stone3dField } from '@/lib/stone-3d';
import { reviewDetail } from '@/lib/stone-review-store';
import { CHUNK_SIZE } from '@/lib/jeweller-listing';
import { boundedBody } from '@/lib/jeweller-listing-files';
import { staffLevel, listingFailure } from '@/lib/jeweller-access';
import { checkChatOrigin, readChatJson, privateHeaders, ChatError } from '@/lib/chat-security';
export const runtime = 'nodejs';
export const maxDuration = 60;
type Context = { params: Promise<{ stoneId: string }> };
async function staffStone(req: NextRequest, ctx: Context) {
  const role = staffLevel(req); if (!role) throw new ChatError(403, 'Staff access required.');
  const { stoneId } = await ctx.params, stone = await getStoneById(stoneId);
  if (!stone) throw new ChatError(404, 'Stone not found');
  return { role, stone };
}
export async function GET(req: NextRequest, ctx: Context) {
  try {
    const { role, stone } = await staffStone(req, ctx);
    // The verification draft holds the measured details staff recorded for the catalogue.
    let review: { title: string; species: string; otherSpecies: string; form: string; measurements: string; carats: number } | null = null, published = false;
    try { const d = await reviewDetail(stone.id); published = d.published; if (d.draft) { const r = d.draft.review; review = { title: r.title, species: r.species, otherSpecies: r.otherSpecies, form: r.form, measurements: r.measurements, carats: r.carats }; } } catch { /* not reviewed yet */ }
    return NextResponse.json({ role, stone, review, published, threeD: stone3dSummary(await readStone3d(stone.id)) }, { headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
export async function PATCH(req: NextRequest, ctx: Context) {
  try {
    checkChatOrigin(req); const { role, stone } = await staffStone(req, ctx), body = await readChatJson(req), action = String(body.action), by = role;
    let record;
    if (action === 'start') {
      const field = String(body.field) as Stone3dField; if (field !== 'model' && field !== 'poster') throw new Error('Staff upload the converted model and picture.');
      record = await startStoneUpload(stone.id, String(stone.ref), field, body.file, by);
      return NextResponse.json({ chunkSize: CHUNK_SIZE, threeD: stone3dSummary(record) }, { headers: privateHeaders });
    }
    if (action === 'save') record = await saveStoneModel(stone.id, body.details, by);
    else if (action === 'approve' || action === 'withdraw') {
      if (role !== 'owner') throw new ChatError(403, 'Only the Owner can approve or withdraw a stone’s 3D.');
      record = await decideStoneModel(stone.id, action === 'approve', by);
    } else throw new Error('Unknown action');
    return NextResponse.json({ threeD: stone3dSummary(record) }, { headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
export async function PUT(req: NextRequest, ctx: Context) {
  try {
    checkChatOrigin(req); const { role, stone } = await staffStone(req, ctx);
    const field = String(req.nextUrl.searchParams.get('field')) as Stone3dField, index = Number(req.nextUrl.searchParams.get('part'));
    if ((field !== 'model' && field !== 'poster') || !Number.isInteger(index) || index < 0) throw new Error('Invalid upload part');
    const record = await addStonePart(stone.id, field, index, await boundedBody(req), role);
    return NextResponse.json({ threeD: stone3dSummary(record) }, { headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
