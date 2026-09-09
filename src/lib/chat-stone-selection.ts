export const CHAT_STONES = [
  { id: "stone-001", name: "Round Brilliant" },
  { id: "stone-002", name: "Oval Brilliant" },
  { id: "stone-003", name: "Emerald Cut" },
  { id: "stone-004", name: "Pear Brilliant" },
  { id: "stone-005", name: "Asscher" },
] as const;
export function isChatStone(id: string) { return CHAT_STONES.some(stone => stone.id === id); }
export function stoneRequest(text: string): { assetId?: string; gem?: string; rare: boolean } | null {
  const value = text.toLowerCase();
  const gem = /\b(diamond|sapphire|ruby|spinel|alexandrite|tanzanite|aquamarine|tourmaline|topaz|garnet)\b/.exec(value)?.[1]
    || (/\b(?:make it|change to) emerald\b/.test(value) ? "emerald" : undefined);
  const explicit = /\bstone-\d+\b/.exec(value)?.[0];
  if (explicit && !isChatStone(explicit)) return null;
  const rare = /\b(rare|obscure|unusual)\b/.test(value);
  const assetId = explicit || (/\boval\b/.test(value) ? "stone-002" : /\basscher\b/.test(value) ? "stone-005" : /\bemerald(?: cut)?\b/.test(value) && gem !== "emerald" ? "stone-003" : /\bpear\b/.test(value) ? "stone-004" : /\bround\b/.test(value) ? "stone-001" : rare ? "stone-005" : undefined);
  return assetId || gem ? { assetId, gem, rare } : null;
}
