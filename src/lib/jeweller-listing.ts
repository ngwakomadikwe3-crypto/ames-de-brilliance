import { z } from 'zod';

const originText = z.string().trim().max(80).default('').transform(v => /^(unknown(?: origin)?|not stated|not known|n\/a)$/i.test(v) ? '' : v);
export const listingInput = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.enum(['ring', 'earrings', 'necklace', 'bracelet', 'watch', 'accessory']),
  description: z.string().trim().max(2000).default(''),
  priceMode: z.enum(['fixed', 'on_request']).default('on_request'),
  amount: z.string().trim().regex(/^(?:|\d{1,9}(?:\.\d{1,2})?)$/).default(''),
  currency: z.string().regex(/^[A-Z]{3}$/).refine(v => Intl.supportedValuesOf('currency').includes(v), 'Choose a supported currency').default('USD'),
  /** Pieces the jeweller has ready to sell; null when not stated. The Owner confirms it at approval. */
  stock: z.number().int().min(0).max(99999).nullable().default(null),
  madeIn: originText,
  gemstones: z.array(z.object({ name: z.string().trim().min(1).max(80), origin: originText }).strict()).max(12).default([]),
  provenanceNotes: z.string().trim().max(1500).default(''),
  rightsConfirmed: z.boolean().default(false),
}).strict().superRefine((v, ctx) => {
  if (v.priceMode === 'fixed' && v.amount.includes('.') && v.amount.split('.')[1].length > new Intl.NumberFormat('en', { style: 'currency', currency: v.currency }).resolvedOptions().maximumFractionDigits!) ctx.addIssue({ code: 'custom', path: ['amount'], message: 'This currency does not support that many decimal places' });
  if (v.priceMode === 'fixed' && (!v.amount || Number(v.amount) <= 0)) ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Enter a positive price' });
});
export type ListingInput = z.infer<typeof listingInput>;
export const CHUNK_SIZE = 3 * 1024 * 1024;
export const fileKinds = ['source', 'preview', 'poster', 'evidence'] as const;
export type ListingFile = {
  id: string; kind: typeof fileKinds[number]; name: string; bytes: number; sha256: string;
  parts: { id: string; bytes: number; sha256: string }[]; complete: boolean; createdAt: string;
};
export type ListingReview = {
  priceChecked: boolean; originChecked: boolean; rightsChecked: boolean; technicalChecked: boolean; visualChecked: boolean;
  madeInVerified: boolean; gemstoneOriginsVerified: boolean[]; evidenceIds: string[]; notes: string;
  /** Set when a verified jeweller's converted model passed the automatic check and was published without staff review. */
  automatic?: AutomaticCheck;
};
export type AutomaticCheck = { at: string; triangles: number; stones: number; melee: number; size: number[]; category: string; confidence: string; reasons: string[] };
/** Review record for automatic publication: only the technical check is attested; origins stay declared. */
export function automaticReview(listing: JewellerListing, check: Omit<AutomaticCheck, 'at'>): ListingReview {
  return { priceChecked: false, originChecked: false, rightsChecked: false, technicalChecked: true, visualChecked: false, madeInVerified: false,
    gemstoneOriginsVerified: listing.details.gemstones.map(() => false), evidenceIds: [], notes: 'Published automatically after the AMES 3D model check.', automatic: { ...check, at: new Date().toISOString() } };
}
export const reviewSchema = z.object({
  priceChecked: z.literal(true), originChecked: z.literal(true), rightsChecked: z.literal(true), technicalChecked: z.literal(true), visualChecked: z.literal(true),
  madeInVerified: z.boolean(), gemstoneOriginsVerified: z.array(z.boolean()).max(12), evidenceIds: z.array(z.uuid()).max(12), notes: z.string().trim().min(20).max(1500),
}).strict();
export type JewellerListing = {
  id: string; jewellerId: string; version: number; details: ListingInput;
  status: 'draft' | 'submitted' | 'needs_revision' | 'approved' | 'published' | 'rejected';
  files: ListingFile[]; review: ListingReview | null; reason: string;
  conversion: { status: 'queued' | 'processing' | 'ready' | 'failed'; sourceId: string; units: 'unknown' | 'mm' | 'cm' | 'm' | 'in'; jobId?: string; lease?: string; leaseUntil?: string; error?: string } | null;
  createdAt: string; updatedAt: string; audit: { action: string; at: string; actor: string; reason: string }[];
};
export const editable = (listing: JewellerListing) => ['draft', 'needs_revision'].includes(listing.status);
export function newListing(id: string, jewellerId: string, input: unknown, now = new Date().toISOString()): JewellerListing {
  return { id, jewellerId, version: 1, details: listingInput.parse(input), status: 'draft', files: [], review: null, reason: '', conversion: null,
    createdAt: now, updatedAt: now, audit: [{ action: 'created', at: now, actor: jewellerId, reason: '' }] };
}
export function changeListing(listing: JewellerListing, changes: Partial<JewellerListing>, action: string, actor: string, reason = ''): JewellerListing {
  const at = new Date().toISOString();
  return { ...listing, ...changes, version: listing.version + 1, updatedAt: at, audit: [...listing.audit, { action, actor, at, reason }].slice(-80) };
}
export function uploadInput(input: unknown) {
  const parsed = z.object({ kind: z.enum(fileKinds), name: z.string().trim().min(1).max(160).regex(/^[^\\/\r\n]+$/), bytes: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(input);
  const ext = parsed.name.split('.').pop()?.toLowerCase() || '';
  const allowed = parsed.kind === 'source' ? ['3dm', 'glb', 'obj', 'stl', 'fbx'] : parsed.kind === 'preview' ? ['glb'] : parsed.kind === 'poster' ? ['png', 'jpg', 'jpeg', 'webp'] : ['pdf', 'png', 'jpg', 'jpeg', 'webp'];
  if (!allowed.includes(ext) || parsed.bytes > (['source', 'preview'].includes(parsed.kind) ? 100 : 4) * 1024 * 1024) throw new Error('Unsupported file or file exceeds its upload limit');
  return parsed;
}
export function approveListing(listing: JewellerListing, input: unknown): ListingReview {
  if (listing.status !== 'submitted') throw new Error('Submit the listing before review');
  if (!listing.details.rightsConfirmed) throw new Error('Confirm the right to list this design');
  const review = reviewSchema.parse(input);
  if (!['source', 'preview', 'poster'].every(kind => listing.files.some(f => f.kind === kind && f.complete))) throw new Error('A source, exported GLB preview and product image are required');
  if (review.gemstoneOriginsVerified.length !== listing.details.gemstones.length) throw new Error('Review each gemstone origin separately');
  if (review.madeInVerified && !listing.details.madeIn) throw new Error('No manufacturing origin was declared');
  if (review.gemstoneOriginsVerified.some((v, i) => v && !listing.details.gemstones[i].origin)) throw new Error('Cannot verify an unstated gemstone origin');
  if (review.evidenceIds.some(id => !listing.files.some(f => f.id === id && f.kind === 'evidence' && f.complete))) throw new Error('Origin evidence must belong to this listing');
  if ((review.madeInVerified || review.gemstoneOriginsVerified.some(Boolean)) && !review.evidenceIds.length) throw new Error('Attach and select supporting evidence before verifying origin');
  return review;
}
export function publicListing(listing: JewellerListing, businessName: string, storefrontSlug?: string) {
  if (listing.status !== 'published' || !listing.review) throw new Error('Listing is not public');
  if (!listing.review.automatic) approveListing({ ...listing, status: 'submitted' }, listing.review);
  const preview = listing.files.find(f => f.kind === 'preview' && f.complete), poster = listing.files.find(f => f.kind === 'poster' && f.complete);
  if (!preview || !poster) throw new Error('Published assets are unavailable');
  const d = listing.details, url = (id: string) => `/api/catalogue/${listing.id}/files/${id}`;
  return { id: listing.id, assetId: `listing-${listing.id}`, revisionId: `listing-${listing.id}:${listing.version}`, name: d.name, category: d.category, description: d.description,
    businessName, storefrontUrl: storefrontSlug ? `/makers/${storefrontSlug}` : null, price: d.priceMode === 'fixed' ? { amount: Number(d.amount), currency: d.currency } : null,
    madeIn: { country: d.madeIn, verified: listing.review.madeInVerified },
    gemstones: d.gemstones.map((gem, i) => ({ ...gem, verified: listing.review!.gemstoneOriginsVerified[i] })),
    stock: d.stock ?? null, previewUrl: url(preview.id), posterUrl: url(poster.id), studio: Boolean(listing.review.automatic) };
}
export type PublicListing = ReturnType<typeof publicListing>;
