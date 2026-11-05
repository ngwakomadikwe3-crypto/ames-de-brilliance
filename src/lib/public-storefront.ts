import { listProfiles } from './jeweller-store';
import { effectiveProfileStatus } from './jeweller-profile';
import { listListings } from './jeweller-listing-store';
import { publicListing } from './jeweller-listing';
export async function publicStorefront(slug: string) {
  if (!/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(slug)) throw new Error('Storefront not found');
  const profiles = (await listProfiles()).filter(p => p.storefront?.slug === slug);
  if (profiles.length !== 1) throw new Error('Storefront not found');
  const profile = profiles[0], shop = profile.storefront!;
  if (!shop.published || !shop.rightsConfirmed || effectiveProfileStatus(profile) !== 'verified') throw new Error('Storefront not available');
  const listings = (await listListings()).filter(l => l.jewellerId === profile.id && l.status === 'published').map(l => publicListing(l, profile.businessName, shop.slug));
  const logo = profile.files.find(f => f.id === shop.logoId && ['portrait','portfolio'].includes(f.kind) && f.mime.startsWith('image/'));
  return { profile, data: { slug, name: profile.businessName, bio: shop.bio, location: shop.showLocation ? [profile.city, profile.country].filter(Boolean).join(', ') : '',
    specialties: profile.specialties, logoUrl: logo ? `/api/makers/${slug}/logo` : null, listings } };
}
