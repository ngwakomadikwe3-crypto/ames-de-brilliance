import type { AssetManifest, AssetRecord } from '@ames/engine';

export type IntentStage = 'BROWSING' | 'INTERESTED' | 'CONSIDERING' | 'HIGH_INTENT' | 'READY_TO_RESERVE';
export type BuyingIntent = {
  stage: IntentStage;
  occasion?: string;
  recipient?: string;
  category?: AssetRecord['category'];
  budget?: number;
  metal?: string;
  shape?: string;
  size?: string;
  timing?: string;
  style?: string;
  mode?: 'browsing' | 'comparing' | 'enquiring' | 'reserving';
};

export type BoutiqueRecommendation = AssetRecord & { price?: number; metal?: string; specs?: string };
const knownDetails: Record<string, { price: number; metal: string; specs: string }> = {
  'aurora solitaire': { price: 6800, metal: 'platinum', specs: '1.20 ct · D / VVS1' },
  'halo pendant': { price: 3900, metal: 'platinum', specs: '0.90 ct halo · D / VS1' },
  'stellar studs': { price: 2400, metal: 'platinum', specs: '1.00 ct pair · D / VS1' },
  'river bracelet': { price: 5200, metal: 'platinum', specs: '3.50 ct total · D-F / VS' },
};
const categories: Record<string, AssetRecord['category']> = { ring: 'ring', rings: 'ring', necklace: 'necklace', necklaces: 'necklace', earrings: 'earring', earring: 'earring', bracelet: 'bracelet', bracelets: 'bracelet' };

export function updateBuyingIntent(previous: BuyingIntent, message: string): BuyingIntent {
  const value = message.toLowerCase();
  const next: BuyingIntent = { ...previous };
  for (const [word, category] of Object.entries(categories)) if (new RegExp(`\\b${word}\\b`).test(value)) next.category = category;
  const budget = value.match(/(?:\$|usd\s*)(\d[\d,]*(?:\.\d+)?)(?:\s*k)?\b/i);
  if (budget) { const raw = Number(budget[1].replace(/,/g, '')); next.budget = /k\b/i.test(budget[0]) ? raw * 1000 : raw; }
  if (/\b(platinum|white gold|yellow gold|rose gold|silver)\b/.test(value)) next.metal = value.match(/\b(platinum|white gold|yellow gold|rose gold|silver)\b/)?.[1];
  if (/\b(oval|round|emerald|pear|cushion|marquise|princess|asscher)\b/.test(value)) next.shape = value.match(/\b(oval|round|emerald|pear|cushion|marquise|princess|asscher)\b/)?.[1];
  if (/\b(anniversary|birthday|engagement|wedding|gift|occasion)\b/.test(value)) next.occasion = value.match(/\b(anniversary|birthday|engagement|wedding|gift|occasion)\b/)?.[1];
  if (/\b(she|her|wife|partner|him|his|husband|my daughter|my mother)\b/.test(value)) next.recipient = value.match(/\b(she|her|wife|partner|him|his|husband|my daughter|my mother)\b/)?.[1];
  if (/\b(reserve|hold|take it|secure)\b/.test(value)) next.mode = 'reserving';
  else if (/\b(compare|cheaper|instead|different)\b/.test(value)) next.mode = 'comparing';
  else if (/\b(enquire|enquiry|availability|available)\b/.test(value)) next.mode = 'enquiring';
  else if (/\b(just looking|browsing)\b/.test(value)) next.mode = 'browsing';
  if (/\bcheaper|less expensive|lower budget\b/.test(value) && next.budget) next.budget = Math.round(next.budget * 0.75);
  const hasSpecifics = !!next.category && (!!next.budget || !!next.metal || !!next.shape);
  next.stage = next.mode === 'reserving' ? 'READY_TO_RESERVE' : hasSpecifics && next.budget ? 'HIGH_INTENT' : hasSpecifics ? 'CONSIDERING' : next.category || next.shape ? 'INTERESTED' : 'BROWSING';
  return next;
}

function numeric(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') { const n = Number(value.replace(/[$,]/g, '')); return Number.isFinite(n) ? n : undefined; }
  return undefined;
}
export function matchBoutiquePiece(manifest: AssetManifest, intent: BuyingIntent): BoutiqueRecommendation | null {
  if (!intent.category || !intent.budget || intent.stage === 'BROWSING' || intent.stage === 'INTERESTED') return null;
  const candidates = manifest.assets.filter(asset => asset.status !== 'archived' && asset.category === intent.category) as BoutiqueRecommendation[];
  const budget = intent.budget;
  if (budget === undefined) return null;
  const scored = candidates.map(asset => {
    const data = asset as BoutiqueRecommendation & Record<string, unknown>;
    const known = knownDetails[asset.name.trim().toLowerCase()];
    const price = numeric(data.price) ?? known?.price;
    const metal = typeof data.metal === 'string' ? data.metal : known?.metal;
    const specs = typeof data.specs === 'string' ? data.specs : known?.specs;
    const text = [asset.name, ...(asset.tags || []), metal, specs].filter(Boolean).join(' ').toLowerCase();
    if (intent.metal && !text.includes(intent.metal.toLowerCase())) return { asset, score: -Infinity };
    if (intent.shape && !text.includes(intent.shape.toLowerCase()) && intent.category === 'ring') return { asset, score: -Infinity };
    const distance = price ? Math.abs(price - budget) / budget : 1;
    return { asset, score: 10 - distance * 10 + (price ? 2 : 0), price };
  }).filter(item => Number.isFinite(item.score)).sort((a, b) => b.score - a.score);
  if (!scored.length || scored[0].score < 3) return null;
  const item = scored[0];
  const known = knownDetails[item.asset.name.trim().toLowerCase()];
  return Object.assign(item.asset, known || {}, item.price === undefined ? {} : { price: item.price });
}

export function recommendationLabel(piece: BoutiqueRecommendation): string {
  const data = piece as BoutiqueRecommendation & Record<string, unknown>;
  const specs = typeof data.specs === 'string' ? data.specs : [data.metal, ...(piece.tags || [])].filter(Boolean).join(' · ');
  return [piece.name, piece.category, specs, data.price ? `$${Number(data.price).toLocaleString()}` : 'Price on request'].filter(Boolean).join(' · ');
}
