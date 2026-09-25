import { z } from 'zod';

export const BOUTIQUE_CATEGORIES = [
  { label: 'Rings', key: 'ring' }, { label: 'Earrings', key: 'earrings' },
  { label: 'Necklaces', key: 'necklace' }, { label: 'Bracelets', key: 'bracelet' },
  { label: 'Diamonds', key: 'diamond' },
] as const;
export type BoutiqueCategory = string;

const packPath = z.string().min(1).refine(value => !value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..'), 'Unsafe pack path');
const price = z.union([z.number().nonnegative(), z.string().min(1), z.object({ amount: z.number().nonnegative(), currency: z.string().min(1) })]);
const contractSchema = z.object({
  schemaVersion: z.literal('ames.boutique-content/1'),
  assetId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/), revisionId: z.string().min(1),
  publicationStatus: z.enum(['review', 'published']), visualApproval: z.enum(['pending', 'approved', 'rejected']),
  category: z.string().min(1), name: z.string().min(1),
  thumbnail: packPath, heroImage: packPath, interactiveGlb: packPath, poster: packPath,
  essentialSpecs: z.record(z.string(), z.unknown()),
  price: price.optional(), inquiryState: z.string().optional(), availabilityState: z.string().optional(),
});
const indexSchema = z.object({ schemaVersion: z.literal('ames.boutique-index/1'), contracts: z.array(packPath) });

export type BoutiquePiece = {
  assetId: string;
  revisionId: string;
  category: string;
  name: string;
  thumbnail: string;
  heroImage: string;
  interactiveGlb: string;
  poster: string;
  essentialSpecs: Record<string, unknown>;
  price?: z.infer<typeof price>;
  inquiryState?: string;
  availabilityState?: string;
  publicationStatus: 'review' | 'published';
  visualApproval: 'pending' | 'approved' | 'rejected';
};

const root = '/ames-engine/';
const assetUrl = (assetId: string, path: string) => `${root}${assetId}/${path.split('/').map(encodeURIComponent).join('/')}`;

export async function loadBoutiqueContent(fetcher: typeof fetch = fetch): Promise<BoutiquePiece[]> {
  const indexResponse = await fetcher(root + 'boutique/index.json');
  if (!indexResponse.ok) throw new Error('AMES Boutique index unavailable');
  const index = indexSchema.parse(await indexResponse.json());
  const pieces = await Promise.all(index.contracts.map(async path => {
    const response = await fetcher(root + path);
    if (!response.ok) throw new Error(`AMES Boutique contract unavailable: ${path}`);
    const contract = contractSchema.parse(await response.json());
    const revisionParts = contract.revisionId.split(':');
    if (path !== `${contract.assetId}/app/boutique.json` || revisionParts.length !== 2 || revisionParts[0] !== contract.assetId || !revisionParts[1]) throw new Error('AMES Boutique identity/revision mismatch');
    if (contract.publicationStatus === 'published' && contract.visualApproval !== 'approved') throw new Error('Unapproved Boutique content cannot be published');
    return {
      assetId: contract.assetId, revisionId: contract.revisionId, category: contract.category,
      name: contract.name, thumbnail: assetUrl(contract.assetId, contract.thumbnail),
      heroImage: assetUrl(contract.assetId, contract.heroImage), interactiveGlb: assetUrl(contract.assetId, contract.interactiveGlb),
      poster: assetUrl(contract.assetId, contract.poster), essentialSpecs: contract.essentialSpecs,
      ...(contract.price !== undefined ? { price: contract.price } : {}),
      ...(contract.inquiryState !== undefined ? { inquiryState: contract.inquiryState } : {}),
      ...(contract.availabilityState !== undefined ? { availabilityState: contract.availabilityState } : {}),
      publicationStatus: contract.publicationStatus, visualApproval: contract.visualApproval,
    } satisfies BoutiquePiece;
  }));
  if (new Set(pieces.map(piece => piece.assetId)).size !== pieces.length) throw new Error('Duplicate AMES Boutique asset');
  return pieces;
}

export function boutiqueByCategory(pieces: BoutiquePiece[], category: BoutiqueCategory): BoutiquePiece[] {
  return pieces.filter(piece => piece.category.toLowerCase() === category);
}

export function boutiqueCategories(pieces: BoutiquePiece[]): { key: string; label: string }[] {
  const known = new Set<string>(BOUTIQUE_CATEGORIES.map(item => item.key));
  const additional = [...new Set(pieces.map(piece => piece.category.toLowerCase()))]
    .filter(category => !known.has(category))
    .map(category => ({ key: category, label: category.charAt(0).toUpperCase() + category.slice(1) }));
  return [...BOUTIQUE_CATEGORIES, ...additional];
}

export function boutiqueGroups(pieces: BoutiquePiece[]): BoutiquePiece[][] {
  const groups: BoutiquePiece[][] = [];
  for (let index = 0; index < pieces.length; index += 4) groups.push(pieces.slice(index, index + 4));
  return groups;
}

export function boutiquePrice(price: BoutiquePiece['price']): string | null {
  if (price === undefined) return null;
  if (typeof price === 'string') return price;
  if (typeof price === 'number') return price.toLocaleString();
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: price.currency }).format(price.amount); }
  catch { return `${price.amount.toLocaleString()} ${price.currency}`; }
}
