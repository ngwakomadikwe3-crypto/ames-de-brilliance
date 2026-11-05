import { NextRequest, NextResponse } from 'next/server';
import { jewelryOwnerGuard } from '@/lib/jewelry-auth';
import { checkChatOrigin, readChatJson } from '@/lib/chat-security';
import { createProfile, listProfiles, profileStorage } from '@/lib/jeweller-store';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
export async function GET(request: NextRequest) {
  const denied = jewelryOwnerGuard(request); if (denied) return denied;
  try { return NextResponse.json({ profiles: await listProfiles(), storage: profileStorage() }, { headers }); }
  catch { return NextResponse.json({ error: 'Private jeweller storage is unavailable' }, { status: 503, headers }); }
}
export async function POST(request: NextRequest) {
  const denied = jewelryOwnerGuard(request); if (denied) return denied;
  try { checkChatOrigin(request); return NextResponse.json(await createProfile(await readChatJson(request)), { status: 201, headers }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not create profile' }, { status: 400, headers }); }
}
