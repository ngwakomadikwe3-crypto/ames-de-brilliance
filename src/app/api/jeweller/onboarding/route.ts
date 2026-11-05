import { NextRequest, NextResponse } from 'next/server';
import { customerSession } from '@/lib/customer-session';
import { ownBusiness, selfProfile, checkStorefront } from '@/lib/jeweller-onboarding';
import { createSelfProfile, mutateProfile, reserveStorefrontSlug } from '@/lib/jeweller-store';
import { editProfile, reviewProfile, recordChange } from '@/lib/jeweller-profile';
import { listingFailure } from '@/lib/jeweller-access';
import { checkChatOrigin, readChatJson, privateHeaders } from '@/lib/chat-security';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  try { const { user, profile } = await ownBusiness(req, false); return NextResponse.json({ account: { id: user.$id, name: user.name, email: user.email, verified: user.emailVerification }, profile: profile ? selfProfile(profile) : null }, { headers: privateHeaders }); }
  catch (e) { return listingFailure(e); }
}
export async function POST(req: NextRequest) {
  try {
    checkChatOrigin(req); const body = await readChatJson(req), { user } = await customerSession(req, true);
    if (body.action === 'create') return NextResponse.json({ profile: selfProfile(await createSelfProfile(user.$id, body.details)) }, { status: 201, headers: privateHeaders });
    const { profile } = await ownBusiness(req); if (!profile) throw new Error('Create your business profile first');
    const actor = `account:${user.$id}`;
    const updated = await mutateProfile(profile.id, Number(body.version), async current => {
      if (current.portalUserId !== user.$id) throw new Error('Business profile ownership changed');
      if (body.action === 'save') {
        if (current.status === 'submitted') throw new Error('Wait for the staff review or a revision request before editing');
        if (current.status === 'verified' && body.confirmReverification !== true) throw new Error('Confirm that changed business details require renewed verification');
        return editProfile(current, body.details, actor);
      }
      if (body.action === 'submit') return reviewProfile(current, { action: 'submit' }, new Date().toISOString(), actor);
      if (body.action === 'storefront') {
        const storefront = checkStorefront(current, body.storefront);
        if (current.storefront?.slug && current.storefront.slug !== storefront.slug) throw new Error('Your storefront address is reserved to your business. Ask staff if it needs to change.');
        await reserveStorefrontSlug(storefront.slug, current.id);
        return recordChange(current, { storefront }, 'storefront_updated', storefront.published ? 'Merchant enabled public storefront' : 'Merchant saved a private storefront draft', new Date().toISOString(), actor);
      }
      throw new Error('Only business details, submission and storefront settings can be changed here');
    });
    return NextResponse.json({ profile: selfProfile(updated) }, { headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
