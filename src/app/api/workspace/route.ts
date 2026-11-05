import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { customerSession } from '@/lib/customer-session';
import { readWorkspacePreferences, workspacePreferences, type SavedPiece } from '@/lib/customer-workspace';
import { checkChatOrigin, privateHeaders, readChatJson } from '@/lib/chat-security';
import { listingFailure, verifiedListingProfile } from '@/lib/jeweller-access';
import { getListing, withListingLock } from '@/lib/jeweller-listing-store';
import { publicListing } from '@/lib/jeweller-listing';
import { loadChatStageContent } from '@/lib/ames-chat-content';
export const runtime = 'nodejs';
function lockFor(id: string) { const b = createHash('sha256').update('ames-workspace:' + id).digest().subarray(0,16); b[6] = (b[6] & 15) | 80; b[8] = (b[8] & 63) | 128; const h = b.toString('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`; }
async function savedPiece(id: string): Promise<SavedPiece> {
  if (id.startsWith('listing-')) {
    const l = await getListing(id.slice(8)), data = publicListing(l, (await verifiedListingProfile(l)).businessName);
    return { assetId: data.assetId, name: data.name, image: data.posterUrl, href: `/jewellery/${data.id}`, price: data.price ? `${data.price.amount} ${data.price.currency}` : 'Price on request', origin: data.madeIn.country || 'Not stated' };
  }
  const data = await loadChatStageContent(id, async input => { const path = String(input); if (!/^\/ames-engine\/(?:chat\/index\.json|[a-z0-9][a-z0-9-]*\/app\/(?:asset|chat)\.json)$/.test(path)) throw new Error('Invalid asset path'); return new Response(await readFile(join(process.cwd(), 'public', path.slice(1)), 'utf8')); });
  return { assetId: data.contract.assetId, name: data.name, image: data.posterUrl, href: '/app', price: 'Representative preview', origin: 'Not stated' };
}
export async function GET(req: NextRequest) {
  try {
    const { user } = await customerSession(req), preferences = readWorkspacePreferences((user.prefs as Record<string, unknown>).amesWorkspace);
    if (req.nextUrl.searchParams.get('summary') === '1') return NextResponse.json({ saved: preferences.saved }, { headers: privateHeaders });
    const saved = (await Promise.all(preferences.saved.map(async id => { try { return await savedPiece(id); } catch { return null; } }))).filter(Boolean);
    return NextResponse.json({ user: { id: user.$id, name: user.name, email: user.email, verified: user.emailVerification }, preferences, saved }, { headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
export async function POST(req: NextRequest) {
  try {
    checkChatOrigin(req); const { api, user } = await customerSession(req), body = await readChatJson(req);
    await withListingLock(lockFor(user.$id), async () => {
      const current = await api.get(), prefs = readWorkspacePreferences(current.prefs.amesWorkspace);
      if (body.action === 'profile') {
        const next = workspacePreferences.parse({ ...prefs, role: body.role, country: body.country, phone: body.phone });
        await api.updatePrefs({ prefs: { ...current.prefs, amesWorkspace: next } }); return;
      }
      if (body.action !== 'save' && body.action !== 'remove') throw new Error('Unknown workspace action');
      if (typeof body.assetId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(body.assetId)) throw new Error('Invalid saved piece');
      if (body.action === 'save') await savedPiece(body.assetId);
      const saved = body.action === 'save' ? [...new Set([...prefs.saved, body.assetId])] : prefs.saved.filter(id => id !== body.assetId);
      const next = workspacePreferences.parse({ ...prefs, saved });
      await api.updatePrefs({ prefs: { ...current.prefs, amesWorkspace: next } });
    });
    return NextResponse.json({ ok: true }, { headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
