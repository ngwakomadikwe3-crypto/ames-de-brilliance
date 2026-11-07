// Dealer portal: upload a 3D scan (Sarine, Helium and similar scanners) of one of the dealer's own stones.
import { NextRequest, NextResponse } from 'next/server';
import { getTraderByPortalCode, getStoneById } from '@/lib/db';
import { startStoneUpload, addStonePart, stone3dSummary } from '@/lib/stone-3d';
import { CHUNK_SIZE } from '@/lib/jeweller-listing';
import { boundedBody } from '@/lib/jeweller-listing-files';
import { checkChatOrigin, readChatJson, privateHeaders, ChatError } from '@/lib/chat-security';
export const runtime = 'nodejs';
export const maxDuration = 60;
type Context = { params: Promise<{ code: string; stoneId: string }> };
async function dealerStone(ctx: Context) {
  const { code, stoneId } = await ctx.params, trader = await getTraderByPortalCode(code);
  if (!trader) throw new ChatError(404, 'Not found');
  const stone = await getStoneById(stoneId);
  if (!stone || String(stone.trader_id) !== String(trader.id)) throw new ChatError(404, 'Stone not found');
  return { trader, stone };
}
const fail = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : 'Upload failed' }, { status: e instanceof ChatError ? e.status : 400, headers: privateHeaders });
export async function POST(req: NextRequest, ctx: Context) {
  try {
    checkChatOrigin(req); const { trader, stone } = await dealerStone(ctx);
    const record = await startStoneUpload(stone.id, String(stone.ref), 'scan', await readChatJson(req), `dealer:${trader.id}`);
    return NextResponse.json({ chunkSize: CHUNK_SIZE, threeD: stone3dSummary(record) }, { headers: privateHeaders });
  } catch (e) { return fail(e); }
}
export async function PUT(req: NextRequest, ctx: Context) {
  try {
    checkChatOrigin(req); const { trader, stone } = await dealerStone(ctx);
    const index = Number(req.nextUrl.searchParams.get('part'));
    if (!Number.isInteger(index) || index < 0) throw new Error('Invalid part');
    const record = await addStonePart(stone.id, 'scan', index, await boundedBody(req), `dealer:${trader.id}`);
    return NextResponse.json({ threeD: stone3dSummary(record) }, { headers: privateHeaders });
  } catch (e) { return fail(e); }
}
