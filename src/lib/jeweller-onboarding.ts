import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { customerSession } from './customer-session';
import { listProfiles } from './jeweller-store';
import { profileInput, profileGaps, effectiveProfileStatus, type JewellerProfile } from './jeweller-profile';
import { ChatError } from './chat-security';
const reserved = new Set(['admin', 'api', 'app', 'ames', 'account', 'new', 'login', 'dashboard', 'support', 'privacy', 'terms']);
export const storefrontInput = z.object({ slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/).refine(s => !reserved.has(s), 'Choose a different storefront address'),
  bio: z.string().trim().max(1000).default(''), showLocation: z.boolean().default(false), logoId: z.union([z.literal(''), z.uuid()]).default(''),
  published: z.boolean().default(false), rightsConfirmed: z.boolean().default(false),
}).strict();
export async function ownBusiness(req: NextRequest, verifiedEmail = true) {
  const { user } = await customerSession(req, verifiedEmail);
  const profiles = (await listProfiles()).filter(p => p.portalUserId === user.$id);
  if (profiles.length > 1) throw new ChatError(409, 'Ask staff to resolve duplicate business profiles.');
  return { user, profile: profiles[0] || null };
}
export function selfProfile(profile: JewellerProfile) {
  return { id: profile.id, version: profile.version, details: profileInput.parse(Object.fromEntries(Object.keys(profileInput.shape).map(key => [key, profile[key as keyof JewellerProfile]]))), status: profile.status,
    effectiveStatus: effectiveProfileStatus(profile), verifiedUntil: profile.verifiedUntil, files: profile.files,
    gaps: profileGaps(profile), storefront: profile.storefront || null,
    feedback: [...profile.audit].reverse().find(a => ['request_revision', 'suspend'].includes(a.action))?.reason || '' };
}
export function checkStorefront(profile: JewellerProfile, input: unknown) {
  const storefront = storefrontInput.parse(input);
  if (storefront.published && (effectiveProfileStatus(profile) !== 'verified' || !storefront.rightsConfirmed)) throw new Error('Complete business verification and confirm publication rights before opening your storefront');
  if (storefront.logoId && !profile.files.some(f => f.id === storefront.logoId && ['portrait', 'portfolio'].includes(f.kind) && f.mime.startsWith('image/'))) throw new Error('Choose a portrait or portfolio image you own; identity and business documents cannot be public logos');
  return storefront;
}
