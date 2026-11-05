import { z } from 'zod';
import chatDefault from './chat-default.json' with { type: 'json' };

export const viewerActionSchema = z.enum(['rotate', 'stop_rotation', 'zoom', 'reset', 'hero_view', 'macro_view', 'side_view', 'inspect_setting']);
export type ViewerAction = z.infer<typeof viewerActionSchema>;

const relativeAsset = z.string().min(1).refine(value => !value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..'), 'Unsafe asset path');
const specsSchema = z.object({ physicalScaleConfirmed: z.boolean(), unitMeaning: z.string(), manufacturingReady: z.boolean() }).passthrough();
const chatSchema = z.object({
  schemaVersion: z.literal('ames.chat-content/1'), assetId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/), revisionId: z.string().min(1),
  publicationStatus: z.enum(['review', 'published']), visualApproval: z.enum(['pending', 'approved', 'rejected']),
  presentation: z.enum(['interactive', 'reference-image']).optional(),
  type: z.enum(['jewelry', 'gemstone']), stageAsset: relativeAsset, poster: relativeAsset,
  rotationEnabled: z.boolean(), defaultView: z.string().min(1), supportedViewerActions: z.array(viewerActionSchema),
  essentialSpecs: specsSchema, heroImage: relativeAsset, macroImage: relativeAsset, visualModes: z.array(z.string()),
});
const assetSchema = z.object({
  schemaVersion: z.literal('ames.app-asset/1'), assetId: z.string(), revisionId: z.string(),
  name: z.string().min(1), category: z.string().min(1),
  publicationStatus: z.enum(['review', 'published']), visualApproval: z.enum(['pending', 'approved', 'rejected']),
  limitations: z.array(z.string()), verifiedClaims: z.record(z.string(), z.unknown()),
});
const indexSchema = z.object({ schemaVersion: z.literal('ames.chat-index/1'), contracts: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]*\/app\/chat\.json$/)).min(1) });

export type ChatContent = z.infer<typeof chatSchema>;
export type ChatStageContent = {
  contract: ChatContent;
  name: string;
  category: string;
  limitations: string[];
  stageUrl: string;
  posterUrl: string;
  heroUrl: string;
  macroUrl: string;
  commerciallyApproved: boolean;
};

const baseFor = (assetId: string) => `/ames-engine/${assetId}/`;
const urlFor = (base: string, path: string) => base + path.split('/').map(encodeURIComponent).join('/');

export async function loadChatStageContent(assetId?: string, fetcher: typeof fetch = fetch): Promise<ChatStageContent> {
  if (assetId?.startsWith('listing-')) {
    const id = assetId.slice(8); if (!z.uuid().safeParse(id).success) throw new Error('Invalid listing identity');
    const response = await fetcher(`/api/catalogue/${id}`); if (!response.ok) throw new Error('Published listing unavailable');
    const origin = z.object({ country: z.string(), verified: z.boolean() });
    const l = z.object({ id: z.uuid(), assetId: z.string(), revisionId: z.string(), name: z.string(), category: z.string(), price: z.object({ amount: z.number().positive(), currency: z.string().regex(/^[A-Z]{3}$/) }).nullable(), madeIn: origin,
      gemstones: z.array(z.object({ name: z.string(), origin: z.string(), verified: z.boolean() })), previewUrl: z.string(), posterUrl: z.string() }).parse(await response.json());
    if (l.id !== id || l.assetId !== assetId || !l.revisionId.startsWith(`${assetId}:`) || ![l.previewUrl, l.posterUrl].every(url => new RegExp(`^/api/catalogue/${id}/files/[a-f0-9-]{36}$`).test(url))) throw new Error('Listing content identity mismatch');
    const essentialSpecs = { physicalScaleConfirmed: false, unitMeaning: 'unverified', manufacturingReady: false,
      price: l.price ? `${l.price.amount} ${l.price.currency}` : 'Price on request', manufacturingOrigin: l.madeIn.country || 'Not stated', manufacturingOriginEvidenceReviewed: l.madeIn.verified,
      gemstoneOrigins: l.gemstones.map(g => `${g.name}: ${g.origin || 'Not stated'} (${g.verified ? 'evidence reviewed' : 'declared / unknown'})`).join('; ') };
    return { name: l.name, category: l.category, commerciallyApproved: true, limitations: ['A visual preview does not certify manufacturing dimensions or gemstone identity.'],
      stageUrl: l.previewUrl, posterUrl: l.posterUrl, heroUrl: l.posterUrl, macroUrl: l.posterUrl,
      contract: { schemaVersion: 'ames.chat-content/1', assetId, revisionId: l.revisionId, publicationStatus: 'published', visualApproval: 'approved', type: 'jewelry',
        stageAsset: 'web/jewelry.glb', poster: 'web/poster.png', rotationEnabled: false, defaultView: 'three_quarter', supportedViewerActions: ['rotate','stop_rotation','zoom','reset','side_view'], essentialSpecs,
        heroImage: 'web/poster.png', macroImage: 'web/poster.png', visualModes: ['interactive'] } };
  }
  const root = '/ames-engine/';
  const indexResponse = await fetcher(root + 'chat/index.json');
  if (!indexResponse.ok) throw new Error('AMES Chat index is unavailable');
  const index = indexSchema.parse(await indexResponse.json());
  const requestedId = assetId ?? chatDefault.assetId;
  const path = index.contracts.find(path => path.split('/')[0] === requestedId);
  if (!path) throw new Error(`AMES Chat asset is unavailable: ${assetId}`);
  const selectedId = path.split('/')[0];
  const [chatResponse, assetResponse] = await Promise.all([fetcher(root + path), fetcher(root + `${selectedId}/app/asset.json`)]);
  if (!chatResponse.ok || !assetResponse.ok) throw new Error('AMES Chat content is unavailable');
  const contract = chatSchema.parse(await chatResponse.json());
  const asset = assetSchema.parse(await assetResponse.json());
  if (path !== `${contract.assetId}/app/chat.json` || contract.assetId !== asset.assetId || contract.revisionId !== asset.revisionId || !contract.revisionId.startsWith(`${contract.assetId}:`)) throw new Error('AMES Chat content revision mismatch');
  if (contract.publicationStatus !== asset.publicationStatus || contract.visualApproval !== asset.visualApproval) throw new Error('AMES Chat approval state mismatch');
  if (contract.publicationStatus === 'published' && contract.visualApproval !== 'approved') throw new Error('Unapproved AMES content cannot be published');
  const base = baseFor(contract.assetId);
  return {
    contract, name: asset.name, category: asset.category, limitations: asset.limitations,
    stageUrl: urlFor(base, contract.stageAsset), posterUrl: urlFor(base, contract.poster),
    heroUrl: urlFor(base, contract.heroImage), macroUrl: urlFor(base, contract.macroImage),
    commerciallyApproved: contract.publicationStatus === 'published' && contract.visualApproval === 'approved',
  };
}

export function supportedViewerAction(value: unknown, contract: ChatContent | null): ViewerAction | null {
  const parsed = viewerActionSchema.safeParse(value);
  return parsed.success && contract?.supportedViewerActions.includes(parsed.data) ? parsed.data : null;
}
