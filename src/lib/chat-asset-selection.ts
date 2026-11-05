import registry from './gemstone-registry.json' with { type: 'json' };

import chatDefault from './chat-default.json' with { type: 'json' };
export const DEFAULT_CHAT_ASSET_ID = chatDefault.assetId;
export const CONCEPT_DIAMOND_ASSET_ID = 'demo-modern-diamond';
export const OPENWORK_RING_ASSET_ID = chatDefault.ringAssetId;

export type GemstoneDefinition = {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  form: string;
  cut: string;
  defaultColors: string[];
  limitations: string[];
};

export const gemstoneRegistry = registry as GemstoneDefinition[];
export const gemstoneAssetIds = new Set(gemstoneRegistry.map(stone => stone.id));

export function isGemstoneAssetId(assetId: string | null | undefined): boolean {
  return !!assetId && (gemstoneAssetIds.has(assetId) || assetId === CONCEPT_DIAMOND_ASSET_ID);
}

export type AssetSelectionIntent =
  | { kind: 'none' }
  | { kind: 'select'; assetId: string; name: string }
  | { kind: 'ring'; assetId: typeof OPENWORK_RING_ASSET_ID }
  | { kind: 'multiple'; matches: { assetId: string; name: string }[] }
  | { kind: 'unsupported_color'; assetId: string; name: string; color: string; defaults: string[] };

type Match = { assetId: string; name: string; start: number; end: number; defaults: string[] };

const normalize = (value: string) => value.toLowerCase().replace(/[’‘]/g, "'").replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phrases = gemstoneRegistry.flatMap(stone => [stone.name, ...stone.aliases].map(alias => ({ stone, alias: normalize(alias) }))).sort((a, b) => b.alias.length - a.alias.length);
const colorWords = [...new Set([
  'red', 'blue', 'green', 'yellow', 'purple', 'violet', 'pink', 'orange', 'white', 'black', 'brown',
  'golden', 'honey', 'amber', 'clear', 'colorless', 'colourless', 'cream', 'ivory', 'peach', 'lilac',
  'lavender', 'turquoise', 'teal', 'crimson', 'burgundy', 'champagne', 'copper', 'rose', 'multicolor',
  'multicolour', 'bicolor', 'bicolour', 'pale blue', 'light blue', 'sky blue', 'royal blue',
  'cornflower blue', 'deep blue', 'ultramarine', 'dark red', 'pigeon blood red', 'bluish green',
  'blue green', 'yellow green', 'olive green', 'pale pink', 'peach pink', 'milky white', 'violet blue',
  'bluish violet', 'fancy yellow', 'canary yellow', 'purple and yellow', 'violet and yellow',
])].sort((a, b) => b.length - a.length);

function matchesIn(text: string): Match[] {
  const found: Match[] = [];
  for (const { stone, alias } of phrases) {
    const pattern = new RegExp(`(?:^|[^a-z0-9])(${escapePattern(alias)})(?=$|[^a-z0-9])`, 'g');
    for (const match of text.matchAll(pattern)) {
      const start = (match.index ?? 0) + match[0].indexOf(match[1]);
      const end = start + match[1].length;
      const prefix = text.slice(Math.max(0, start - 30), start);
      if (/(?:not|no|without|except|besides|other than|instead of|don't show|do not show|dont show|anything but)\s+(?:a\s+|an\s+|the\s+)?$/.test(prefix)) continue;
      found.push({ assetId: stone.id, name: stone.name, start, end, defaults: stone.defaultColors });
    }
  }
  // A multiword alias owns its span: "water sapphire" is Iolite, not two stones.
  return found.filter(candidate => !found.some(other => other !== candidate && other.start <= candidate.start && other.end >= candidate.end && (other.end - other.start > candidate.end - candidate.start || other.assetId === candidate.assetId)));
}

function ringRequested(text: string): boolean {
  return /^(?:show|bring|restore|return|go back)(?:\s+me)?\s+(?:the\s+)?(?:openwork\s+pave\s+|openwork\s+pavé\s+|revision\s+3\s+)?ring(?:\s+again)?\s*[.!?]?$/.test(text)
    || /^(?:show|bring|restore)(?:\s+me)?\s+the\s+ring\s+again\s*[.!?]?$/.test(text);
}

export function parseAssetSelection(query: string, currentAssetId?: string | null): AssetSelectionIntent {
  const text = normalize(query);
  if (!text) return { kind: 'none' };
  if (ringRequested(text)) return { kind: 'ring', assetId: /openwork|revision 3/.test(text) ? OPENWORK_RING_ASSET_ID : DEFAULT_CHAT_ASSET_ID };
  if (/^(?:show|restore|bring back)(?: me)? (?:the )?(?:reference|default|pavé|pave|solitaire) ring(?: again)?[.!?]?$/.test(text)) return { kind: 'ring', assetId: DEFAULT_CHAT_ASSET_ID };
  if (/^(?:show|restore|bring back|return to)(?: me)? (?:the )?(?:default|ames|eclat|éclat|concept|statement)(?: modern)? diamond(?: again)?[.!?]?$/.test(text)) return { kind: 'select', assetId: CONCEPT_DIAMOND_ASSET_ID, name: 'AMES Éclat concept diamond' };
  const spans = matchesIn(text);
  const unique = [...new Map(spans.map(match => [match.assetId, match])).values()];
  if (unique.length === 0) return { kind: 'none' };
  if (unique.length > 1) return { kind: 'multiple', matches: unique.map(({ assetId, name }) => ({ assetId, name })) };

  const selected = unique[0];
  // Constituent-stone questions keep an explicitly selected jewellery product.
  // A direct loose-stone request or a different selected object does not trigger this guard.
  if (!isGemstoneAssetId(currentAssetId) && !/\bloose\b/.test(text) && /\b(?:ring|setting|prongs?|mounted|jewelry|jewellery)\b/.test(text)) {
    return { kind: 'none' };
  }
  const requestedColors = colorWords.flatMap(color => {
    const pattern = new RegExp(`(?:^|[^a-z0-9])${escapePattern(color)}(?=$|[^a-z0-9])`, 'g');
    return [...text.matchAll(pattern)].map(match => ({ color, index: match.index ?? 0 }));
  }).filter((item, index, all) => !all.some((other, otherIndex) => otherIndex !== index && other.color.includes(item.color) && other.color.length > item.color.length && Math.abs(other.index - item.index) < 4)).map(item => item.color);
  const unsupported = requestedColors.find(color => !selected.defaults.includes(color));
  if (unsupported) return { kind: 'unsupported_color', assetId: selected.assetId, name: selected.name, color: unsupported, defaults: selected.defaults };
  return { kind: 'select', assetId: selected.assetId, name: selected.name };
}

/** Only registered stone IDs, the concept diamond, or the preserved ring can cross the API boundary. */
export function validatedAssetSelection(value: unknown): { assetId: string } | null {
  if (typeof value === 'string') {
    return isGemstoneAssetId(value) || value === DEFAULT_CHAT_ASSET_ID || value === OPENWORK_RING_ASSET_ID ? { assetId: value } : null;
  }
  if (!value || typeof value !== 'object') return null;
  const assetId = (value as { assetId?: unknown }).assetId;
  return typeof assetId === 'string' && (isGemstoneAssetId(assetId) || assetId === DEFAULT_CHAT_ASSET_ID || assetId === OPENWORK_RING_ASSET_ID) ? { assetId } : null;
}

export function assetSelectionMessage(intent: AssetSelectionIntent): string | null {
  if (intent.kind === 'multiple') return `Which would you like to display first: ${intent.matches.map(match => match.name).join(' or ')}?`;
  if (intent.kind === 'unsupported_color') return `I don’t have a ${intent.color} ${intent.name} preview. The available representative default is ${intent.defaults[0]}; I haven’t substituted it.`;
  return null;
}
