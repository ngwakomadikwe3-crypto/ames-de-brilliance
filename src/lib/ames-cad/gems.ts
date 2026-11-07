// AMES gemstones for the CAD converter: the app's own stone looks (taken from the gemstone
// library models in public/ames-engine/stone-*) and how a stone's type is read from a CAD file.
// Pure data and maths: shared by the browser converter, the poster and the server check.
import type { Vec3 } from './geometry';

export type GemMode = 'closed-dielectric-visual' | 'polished-gemstone-visual' | 'polished-cabochon-visual' | 'nacre-visual';
export type Gemstone = { id: string; name: string; mode: GemMode; color: Vec3; roughness: number; ior?: number; transmission?: number; words: RegExp };

// color is linear RGB (glTF baseColorFactor), exactly as in the app's gemstone models.
export const GEMSTONES: Gemstone[] = [
  { id: 'stone-diamond', name: 'Diamond', mode: 'closed-dielectric-visual', color: [1, 1, 1], roughness: 0.018, ior: 2.417, transmission: 1, words: /diamond|moissanite|\bcz\b|cubic\s*zirconia|\bvvs|white[\s_-]*stone/i },
  { id: 'stone-fancy-color-diamond', name: 'Fancy colour diamond', mode: 'closed-dielectric-visual', color: [0.913, 0.738, 0.165], roughness: 0.018, ior: 2.417, transmission: 1, words: /(yellow|canary|fancy|champagne|cognac|pink|blue|green|black)[\s_-]*diamond|fancy[\s_-]*colou?r/i },
  { id: 'stone-ruby', name: 'Ruby', mode: 'closed-dielectric-visual', color: [0.68, 0.012, 0.054], roughness: 0.018, ior: 1.77, transmission: 1, words: /ruby|rubies/i },
  { id: 'stone-sapphire', name: 'Sapphire', mode: 'closed-dielectric-visual', color: [0.018, 0.087, 0.658], roughness: 0.018, ior: 1.77, transmission: 1, words: /sapphire|saphire|padparadscha/i },
  { id: 'stone-emerald', name: 'Emerald', mode: 'closed-dielectric-visual', color: [0.007, 0.296, 0.112], roughness: 0.018, ior: 1.58, transmission: 1, words: /emerald(?![\s_-]*cut)/i },
  { id: 'stone-tanzanite', name: 'Tanzanite', mode: 'closed-dielectric-visual', color: [0.223, 0.195, 0.521], roughness: 0.018, ior: 1.7, transmission: 1, words: /tanzanite/i },
  { id: 'stone-amethyst', name: 'Amethyst', mode: 'closed-dielectric-visual', color: [0.314, 0.159, 0.468], roughness: 0.018, ior: 1.544, transmission: 1, words: /(?<!ame)amethyst/i },
  { id: 'stone-ametrine', name: 'Ametrine', mode: 'polished-gemstone-visual', color: [0.361, 0.209, 0.485], roughness: 0.018, ior: 1.544, transmission: 1, words: /ametrine/i },
  { id: 'stone-aquamarine', name: 'Aquamarine', mode: 'closed-dielectric-visual', color: [0.361, 0.738, 0.831], roughness: 0.018, ior: 1.58, transmission: 1, words: /aquamarine|aqua\b/i },
  { id: 'stone-topaz', name: 'Topaz', mode: 'closed-dielectric-visual', color: [0.258, 0.591, 0.776], roughness: 0.018, ior: 1.62, transmission: 1, words: /topaz/i },
  { id: 'stone-citrine', name: 'Citrine', mode: 'closed-dielectric-visual', color: [0.839, 0.521, 0.117], roughness: 0.018, ior: 1.544, transmission: 1, words: /citrine/i },
  { id: 'stone-peridot', name: 'Peridot', mode: 'closed-dielectric-visual', color: [0.407, 0.552, 0.144], roughness: 0.018, ior: 1.65, transmission: 1, words: /peridot/i },
  { id: 'stone-garnet', name: 'Garnet', mode: 'closed-dielectric-visual', color: [0.462, 0.017, 0.041], roughness: 0.018, ior: 1.79, transmission: 1, words: /garnet|tsavorite|rhodolite|spessartite/i },
  { id: 'stone-spinel', name: 'Spinel', mode: 'closed-dielectric-visual', color: [0.323, 0.212, 0.407], roughness: 0.018, ior: 1.718, transmission: 1, words: /spinel/i },
  { id: 'stone-tourmaline', name: 'Tourmaline', mode: 'closed-dielectric-visual', color: [0.112, 0.366, 0.231], roughness: 0.018, ior: 1.62, transmission: 1, words: /tourmaline|rubellite|paraiba/i },
  { id: 'stone-morganite', name: 'Morganite', mode: 'closed-dielectric-visual', color: [0.847, 0.539, 0.527], roughness: 0.018, ior: 1.58, transmission: 1, words: /morganite/i },
  { id: 'stone-kunzite', name: 'Kunzite', mode: 'closed-dielectric-visual', color: [0.768, 0.451, 0.61], roughness: 0.018, ior: 1.66, transmission: 1, words: /kunzite/i },
  { id: 'stone-alexandrite', name: 'Alexandrite', mode: 'closed-dielectric-visual', color: [0.112, 0.342, 0.309], roughness: 0.018, ior: 1.745, transmission: 1, words: /alexandrite/i },
  { id: 'stone-iolite', name: 'Iolite', mode: 'closed-dielectric-visual', color: [0.195, 0.195, 0.456], roughness: 0.018, ior: 1.54, transmission: 1, words: /iolite/i },
  { id: 'stone-zircon', name: 'Zircon', mode: 'closed-dielectric-visual', color: [0.665, 0.503, 0.283], roughness: 0.018, ior: 1.94, transmission: 1, words: /(?<!cubic[\s_-]*)zircon(?!ia)/i },
  { id: 'stone-amber', name: 'Amber', mode: 'closed-dielectric-visual', color: [0.68, 0.198, 0.008], roughness: 0.12, ior: 1.54, transmission: 0.72, words: /\bamber/i },
  { id: 'stone-moonstone', name: 'Moonstone', mode: 'polished-cabochon-visual', color: [0.723, 0.799, 0.855], roughness: 0.12, ior: 1.54, transmission: 0.3, words: /moonstone/i },
  { id: 'stone-opal', name: 'Opal', mode: 'polished-cabochon-visual', color: [0.799, 0.799, 0.738], roughness: 0.2, ior: 1.45, transmission: 0.12, words: /opal/i },
  { id: 'stone-rose-quartz', name: 'Rose quartz', mode: 'polished-cabochon-visual', color: [0.723, 0.376, 0.462], roughness: 0.12, ior: 1.54, transmission: 0.3, words: /rose[\s_-]*quartz/i },
  { id: 'stone-sunstone', name: 'Sunstone', mode: 'polished-cabochon-visual', color: [0.584, 0.171, 0.058], roughness: 0.12, words: /sunstone/i },
  { id: 'stone-jade', name: 'Jade', mode: 'polished-cabochon-visual', color: [0.074, 0.296, 0.162], roughness: 0.22, words: /jade|jadeite|nephrite/i },
  { id: 'stone-lapis-lazuli', name: 'Lapis lazuli', mode: 'polished-cabochon-visual', color: [0.009, 0.047, 0.238], roughness: 0.12, words: /lapis/i },
  { id: 'stone-turquoise', name: 'Turquoise', mode: 'polished-cabochon-visual', color: [0.04, 0.381, 0.376], roughness: 0.12, words: /turquoise/i },
  { id: 'stone-pearl', name: 'Pearl', mode: 'nacre-visual', color: [0.855, 0.807, 0.701], roughness: 0.19, words: /pearl(?!.?ized)|nacre/i },
];
export const GEM_BY_ID = new Map(GEMSTONES.map(g => [g.id, g]));
export const GEM_IDS = new Set(GEMSTONES.map(g => g.id));
export const gem = (id: string) => GEM_BY_ID.get(id) || GEMSTONES[0];
/** Stones the viewer re-cuts itself from ames_cut (the engine's brilliant library). Others are baked by the converter. */
export const ENGINE_RECUT_IDS = new Set(['stone-diamond', 'stone-fancy-color-diamond', 'stone-ruby', 'stone-sapphire', 'stone-morganite', 'stone-alexandrite', 'stone-spinel', 'stone-garnet', 'stone-zircon', 'stone-peridot']);
/** Opaque or translucent stones: polished surface looks, never cut as brilliants. */
export const isSurfaceGem = (id: string) => gem(id).mode !== 'closed-dielectric-visual';
/** Every word that names a stone in a CAD file. */
export const ANY_GEM_WORD = new RegExp(GEMSTONES.map(g => g.words.source).join('|') + '|\\bgems?\\b|stone|cabochon|pav[eé]|melee|brilliant', 'i');

export type GemGuess = { id: string; source: 'name' | 'colour' | 'assumed'; detail: string };

/** A gem named in the object, layer or material names (the most specific name wins). */
export function gemFromName(text: string): GemGuess | null {
  if (!text) return null;
  // Coloured diamonds and named coloured stones before plain "diamond".
  for (const g of [GEMSTONES[1], ...GEMSTONES.slice(2), GEMSTONES[0]]) {
    const m = text.match(g.words); if (m) return { id: g.id, source: 'name', detail: `named “${m[0]}”` };
  }
  return null;
}

const toSrgb = (c: number) => c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
/** Hue (degrees), saturation and lightness of a linear RGB colour, measured in sRGB as the jeweller saw it. */
export function hsl(color: Vec3): [number, number, number] {
  const [r, g, b] = color.map(v => toSrgb(Math.min(1, Math.max(0, v))));
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d < 1e-6) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/** The stone colour a jeweller gave a gem in CAD, read as the usual stone of that colour. */
export function gemFromColour(color: Vec3 | null): GemGuess | null {
  if (!color) return null;
  const [h, s, l] = hsl(color);
  // White, grey or near-black stones, and the near-white default material: diamonds.
  if (s < 0.16 || l > 0.93 || l < 0.05) return null;
  const pick = (id: string, word: string) => ({ id, source: 'colour' as const, detail: `coloured ${word} in the file` });
  if (h >= 345 || h < 12) return l > 0.7 ? pick('stone-morganite', 'pink') : pick('stone-ruby', 'red');
  if (h < 40) return l > 0.72 ? pick('stone-morganite', 'peach') : pick('stone-citrine', 'orange');
  if (h < 68) return pick('stone-citrine', 'yellow');
  if (h < 95) return pick('stone-peridot', 'yellow-green');
  if (h < 165) return pick('stone-emerald', 'green');
  if (h < 200) return l > 0.55 ? pick('stone-aquamarine', 'aqua') : pick('stone-turquoise', 'teal');
  if (h < 250) return l > 0.62 ? pick('stone-aquamarine', 'light blue') : pick('stone-sapphire', 'blue');
  if (h < 268) return pick('stone-tanzanite', 'violet-blue');
  if (h < 300) return pick('stone-amethyst', 'purple');
  if (h < 345) return l > 0.55 ? pick('stone-kunzite', 'pink') : pick('stone-amethyst', 'purple');
  return null;
}

/** A stone's type: its name first, then the colour it was given, otherwise a diamond. */
export function deduceGem(hint: string, color: Vec3 | null): GemGuess {
  return gemFromName(hint) || gemFromColour(color) || { id: 'stone-diamond', source: 'assumed', detail: 'no colour or name in the file' };
}
