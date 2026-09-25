import { z } from 'zod';

export const viewerActionSchema = z.enum(['rotate', 'stop_rotation', 'zoom', 'reset', 'hero_view', 'macro_view', 'side_view', 'inspect_setting']);
export type ViewerAction = z.infer<typeof viewerActionSchema>;

const relativeAsset = z.string().min(1).refine(value => !value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..'), 'Unsafe asset path');
const specsSchema = z.object({ physicalScaleConfirmed: z.boolean(), unitMeaning: z.string(), manufacturingReady: z.boolean() }).passthrough();
const chatSchema = z.object({
  schemaVersion: z.literal('ames.chat-content/1'), assetId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/), revisionId: z.string().min(1),
  publicationStatus: z.enum(['review', 'published']), visualApproval: z.enum(['pending', 'approved', 'rejected']),
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
const indexSchema = z.object({ schemaVersion: z.literal('ames.chat-index/1'), contracts: z.array(relativeAsset).min(1) });

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
  const root = '/ames-engine/';
  const indexResponse = await fetcher(root + 'chat/index.json');
  if (!indexResponse.ok) throw new Error('AMES Chat index is unavailable');
  const index = indexSchema.parse(await indexResponse.json());
  const path = assetId ? `${assetId}/app/chat.json` : index.contracts[0];
  if (!index.contracts.includes(path)) throw new Error(`AMES Chat asset is unavailable: ${assetId}`);
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
