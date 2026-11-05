import { NextRequest, NextResponse } from 'next/server';
import { ownBusiness, selfProfile } from '@/lib/auctioneer-onboarding';
import { addProfileFile } from '@/lib/auctioneer-store';
import { fileKinds } from '@/lib/auctioneer-profile';
import { checkChatOrigin, privateHeaders } from '@/lib/chat-security';
import { listingFailure } from '@/lib/jeweller-access';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  try {
    checkChatOrigin(req); const { user, profile } = await ownBusiness(req); if (!profile) throw new Error('Create your business profile first');
    if (Number(req.headers.get('content-length')) > 4.3 * 1024 * 1024) throw new Error('Choose evidence up to 4 MB');
    const form = await req.formData(), file = form.get('file'), kind = String(form.get('kind')) as typeof fileKinds[number];
    if (!(file instanceof File) || !fileKinds.includes(kind)) throw new Error('Choose a supported evidence file and purpose');
    if (profile.status === 'submitted') throw new Error('Wait for the staff review before changing evidence');
    if (profile.status === 'verified' && form.get('confirmReverification') !== 'true') throw new Error('Changing evidence requires renewed verification');
    const updated = await addProfileFile(profile.id, Number(form.get('version')), file, kind, String(form.get('expiresOn') || ''), `account:${user.$id}`);
    return NextResponse.json({ profile: selfProfile(updated) }, { headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
