import { z } from 'zod';
import type { BoutiquePiece } from './ames-boutique-content';
const origin = z.object({ country: z.string().max(80), verified: z.boolean() });
const artifact = z.string().regex(/^\/api\/catalogue\/[a-f0-9-]{36}\/files\/[a-f0-9-]{36}$/);
export const publicCatalogueSchema = z.object({
  id: z.uuid(), assetId: z.string(), revisionId: z.string(), name: z.string().max(120), category: z.string().max(80), description: z.string().max(2000), businessName: z.string().max(120),
  storefrontUrl: z.string().regex(/^\/makers\/[a-z0-9-]{3,48}$/).nullable().optional(),
  price: z.object({ amount: z.number().positive(), currency: z.string().regex(/^[A-Z]{3}$/) }).nullable(),
  madeIn: origin, gemstones: z.array(z.object({ name: z.string().max(80), origin: z.string().max(80), verified: z.boolean() })).max(12),
  previewUrl: artifact, posterUrl: artifact,
  /** Converted by the AMES converter: tagged stones for the studio diamond viewer. */
  studio: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.assetId !== `listing-${value.id}` || !value.revisionId.startsWith(`${value.assetId}:`) || ![value.previewUrl, value.posterUrl].every(url => url.startsWith(`/api/catalogue/${value.id}/files/`))) ctx.addIssue({ code: 'custom', message: 'Catalogue identity mismatch' });
});
export type CatalogueListing = z.infer<typeof publicCatalogueSchema>;
export const originLabel = (country: string, verified: boolean) => country ? `${country} · ${verified ? 'evidence reviewed by AMES' : 'jeweller declared'}` : 'Not stated';
export async function loadPublishedBoutiqueContent(): Promise<BoutiquePiece[]> {
  const response = await fetch('/api/catalogue', { cache: 'no-store' });
  if (!response.ok) throw new Error('Verified jeweller listings are temporarily unavailable.');
  const { listings } = z.object({ listings: z.array(publicCatalogueSchema) }).parse(await response.json());
  return listings.map(l => ({ assetId: l.assetId, revisionId: l.revisionId, category: l.category, name: l.name,
    thumbnail: l.posterUrl, heroImage: l.posterUrl, interactiveGlb: l.previewUrl, poster: l.posterUrl,
    essentialSpecs: { manufacturingReady: false, physicalScaleConfirmed: false }, ...(l.price ? { price: l.price } : { inquiryState: 'Price on request' }),
    publicationStatus: 'published', visualApproval: 'approved', listing: l }));
}
