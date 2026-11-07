// Catalogue Room: "Request to buy" (signed-in buyers) and the Purchase desk list (staff).
import { NextRequest, NextResponse } from 'next/server';
import { customerSession } from '@/lib/customer-session';
import { createStoneRequest, listStoneRequests, requestInput, stoneRequestView } from '@/lib/stone-requests';
import { reviewDetail } from '@/lib/stone-review-store';
import { sendStoneRequestNotice } from '@/lib/email';
import { staffLevel, listingFailure } from '@/lib/jeweller-access';
import { checkChatOrigin, readChatJson, privateHeaders, ChatError } from '@/lib/chat-security';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  try {
    const staff = req.nextUrl.searchParams.get('staff') === '1';
    if (staff && !staffLevel(req)) throw new ChatError(403, 'Staff access required.');
    const owner = staff ? undefined : (await customerSession(req, true)).user.$id;
    const page = await listStoneRequests(owner, req.nextUrl.searchParams.get('cursor') || undefined);
    return NextResponse.json({ requests: page.records.map(stoneRequestView), next: page.next || null }, { headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
export async function POST(req: NextRequest) {
  try {
    checkChatOrigin(req); const { user } = await customerSession(req, true), input = requestInput.parse(await readChatJson(req));
    const detail = await reviewDetail(input.stoneId);
    if (!detail.published || !detail.draft) throw new ChatError(404, 'This stone is no longer in the catalogue.');
    const r = detail.draft.review;
    const record = await createStoneRequest(user, { stoneId: input.stoneId, ref: detail.stone.ref, title: r.title, carats: r.carats }, input);
    await sendStoneRequestNotice(detail.stone.ref, r.title, user.name, user.email).catch(() => false);
    return NextResponse.json(stoneRequestView(record), { status: 201, headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
