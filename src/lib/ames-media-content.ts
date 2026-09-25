import { z } from 'zod';

const assetId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const packPath = z.string().min(1).refine(value => !value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..'), 'Unsafe pack path');
const approval = z.enum(['pending', 'approved', 'rejected']);
const publication = z.enum(['review', 'published']);
const mediaSchema = z.object({
  schemaVersion: z.literal('ames.media-content/1'), assetId, revisionId: z.string().min(1),
  publicationStatus: publication, visualApproval: approval,
  items: z.array(z.object({ assetId, id: z.string().min(1), mediaType: z.enum(['video', 'image']), path: packPath,
    aspectRatio: z.number().positive(), durationSeconds: z.number().positive().optional(), approvalState: approval,
    tags: z.array(z.string().min(1)).optional() })),
});
const assetSchema = z.object({ schemaVersion: z.literal('ames.app-asset/1'), assetId, revisionId: z.string(),
  name: z.string().min(1), category: z.string().min(1), verifiedClaims: z.record(z.string(), z.unknown()),
  interactive: z.object({ poster: packPath }), });
const boutiqueSchema = z.object({ schemaVersion: z.literal('ames.boutique-content/1'), assetId, revisionId: z.string(),
  name: z.string().min(1), category: z.string().min(1), categoryTags: z.array(z.string()).optional(),
  essentialSpecs: z.record(z.string(), z.unknown()), });
const indexSchema = z.object({ schemaVersion: z.literal('ames.media-index/1'), contracts: z.array(packPath) });

export type MediaRecord = {
  key: string; id: string; assetId: string; name: string; category: string;
  mediaUrl: string; poster: string; mediaType: 'video' | 'image';
  searchTerms: string[]; aspectRatio: number; durationSeconds?: number;
  publicationStatus: 'review' | 'published'; visualApproval: 'pending' | 'approved' | 'rejected';
  approvalState: 'pending' | 'approved' | 'rejected';
  product: { assetId: string; name: string; category: string };
};

const root = '/ames-engine/';
const assetUrl = (id: string, path: string) => `${root}${id}/${path.split('/').map(encodeURIComponent).join('/')}`;
const knownValue = (value: unknown): string[] => {
  if (typeof value === 'string' && value.trim() && !['unknown', 'unresolved', 'pending'].includes(value.toLowerCase())) return [value];
  if (typeof value === 'number') return [String(value)];
  return [];
};

export async function loadMediaContent(fetcher: typeof fetch = fetch): Promise<MediaRecord[]> {
  const indexResponse = await fetcher(root + 'media/index.json');
  if (!indexResponse.ok) throw new Error('AMES Media index unavailable');
  const index = indexSchema.parse(await indexResponse.json());
  const groups = await Promise.all(index.contracts.map(async path => {
    const get = async (url: string) => { const response = await fetcher(url); if (!response.ok) throw new Error(`AMES Media content unavailable: ${url}`); return response.json(); };
    const media = mediaSchema.parse(await get(root + path));
    if (path !== `${media.assetId}/app/media.json` || media.revisionId.split(':')[0] !== media.assetId) throw new Error('AMES Media identity mismatch');
    const [asset, boutique] = await Promise.all([
      get(root + `${media.assetId}/app/asset.json`).then(value => assetSchema.parse(value)),
      get(root + `${media.assetId}/app/boutique.json`).then(value => boutiqueSchema.parse(value)),
    ]);
    if (asset.assetId !== media.assetId || boutique.assetId !== media.assetId || asset.revisionId !== media.revisionId || boutique.revisionId !== media.revisionId) throw new Error('AMES Media metadata mismatch');
    if (media.publicationStatus === 'published' && media.visualApproval !== 'approved') throw new Error('Unapproved Media content cannot be published');
    const terms = [asset.name, asset.category, boutique.name, boutique.category, ...(boutique.categoryTags || []),
      ...Object.values(asset.verifiedClaims).flatMap(knownValue),
      ...Object.entries(boutique.essentialSpecs).filter(([key]) => !['physicalScaleConfirmed', 'unitMeaning', 'manufacturingReady'].includes(key)).flatMap(([, value]) => knownValue(value))];
    return media.items.map(item => {
      if (item.assetId !== media.assetId) throw new Error('AMES Media item asset mismatch');
      if (media.publicationStatus === 'published' && item.approvalState !== 'approved') throw new Error('Unapproved Media item cannot be published');
      return { key: `${media.assetId}:${item.id}`, id: item.id, assetId: item.assetId, name: asset.name, category: asset.category,
        mediaUrl: assetUrl(media.assetId, item.path), poster: item.mediaType === 'image' ? assetUrl(media.assetId, item.path) : assetUrl(media.assetId, asset.interactive.poster),
        mediaType: item.mediaType, searchTerms: [...new Set([...terms, ...(item.tags || [])])], aspectRatio: item.aspectRatio,
        ...(item.durationSeconds !== undefined ? { durationSeconds: item.durationSeconds } : {}),
        publicationStatus: media.publicationStatus, visualApproval: media.visualApproval, approvalState: item.approvalState,
        product: { assetId: media.assetId, name: asset.name, category: asset.category },
      } satisfies MediaRecord;
    });
  }));
  const records = groups.flat();
  if (new Set(records.map(record => record.key)).size !== records.length) throw new Error('Duplicate AMES Media item');
  return records;
}

export function searchMedia(records: MediaRecord[], query: string): MediaRecord[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return records;
  return records.filter(record => words.every(word => record.searchTerms.some(term =>
    (term.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || []).some(token => token.startsWith(word)))));
}

export function isMediaReview(record: MediaRecord): boolean {
  return record.publicationStatus !== 'published' || record.visualApproval !== 'approved' || record.approvalState !== 'approved';
}
