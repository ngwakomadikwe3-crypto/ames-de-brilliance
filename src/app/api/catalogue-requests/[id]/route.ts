import { NextRequest, NextResponse } from 'next/server';
import { changeStoneRequest, stoneRequestView } from '@/lib/stone-requests';
import { staffLevel, listingFailure } from '@/lib/jeweller-access';
import { checkChatOrigin, readChatJson, privateHeaders, ChatError } from '@/lib/chat-security';
export const runtime = 'nodejs';
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkChatOrigin(req); if (!staffLevel(req)) throw new ChatError(403, 'Staff access required.');
    return NextResponse.json(stoneRequestView(await changeStoneRequest((await params).id, await readChatJson(req))), { headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
