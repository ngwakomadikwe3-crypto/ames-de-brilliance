// AMES gemstones for the CAD converter: the app's own stone looks (taken from the gemstone
// library models in public/ames-engine/stone-*) and how a stone's type is read from a CAD file.
// Pure data and maths: shared by the browser converter, the poster and the server check.
import type { Vec3 } from './geometry';

export type GemMode = 'closed-dielectric-visual' | 'polished-gemstone-visual' | 'polished-cabochon-visual' | 'nacre-visual';
/** neutral: white, grey or black stones, matched by name (or for black, by colour), never mistaken for a coloured gem. */
export type Gemstone = { id: string; name: string; mode: GemMode; color: Vec3; roughness: number; ior?: number; transmission?: number; words: RegExp; neutral?: boolean };

// color is linear RGB (glTF baseColorFactor), exactly as in the app's gemstone models.
export const GEMSTONES: Gemstone[] = [
  { id: 'stone-diamond', name: 'Diamond', mode: 'closed-dielectric-visual', color: [1, 1, 1], roughness: 0.018, ior: 2.417, transmission: 1, words: /diamond|moissanite|\bcz\b|cubic\s*zirconia|\bvvs|white[\s_-]*stone/i, neutral: true },
  { id: 'stone-fancy-color-diamond', name: 'Fancy colour diamond', mode: 'closed-dielectric-visual', color: [0.913, 0.738, 0.165], roughness: 0.018, ior: 2.417, transmission: 1, words: /(yellow|canary|fancy)[\s_-]*(colou?r[\s_-]*)?diamond|fancy[\s_-]*colou?r/i },
  { id: 'stone-ruby', name: 'Ruby', mode: 'closed-dielectric-visual', color: [0.68, 0.012, 0.054], roughness: 0.018, ior: 1.77, transmission: 1, words: /ruby|rubies/i },
  { id: 'stone-sapphire', name: 'Sapphire', mode: 'closed-dielectric-visual', color: [0.018, 0.087, 0.658], roughness: 0.018, ior: 1.77, transmission: 1, words: /(blue[\s_-]*)?sapph?ire/i },
  { id: 'stone-emerald', name: 'Emerald', mode: 'closed-dielectric-visual', color: [0.007, 0.296, 0.112], roughness: 0.018, ior: 1.58, transmission: 1, words: /emerald(?![\s_-]*cut)/i },
  { id: 'stone-tanzanite', name: 'Tanzanite', mode: 'closed-dielectric-visual', color: [0.223, 0.195, 0.521], roughness: 0.018, ior: 1.7, transmission: 1, words: /tanzanite/i },
  { id: 'stone-amethyst', name: 'Amethyst', mode: 'closed-dielectric-visual', color: [0.314, 0.159, 0.468], roughness: 0.018, ior: 1.544, transmission: 1, words: /(?<!ame)amethyst/i },
  { id: 'stone-ametrine', name: 'Ametrine', mode: 'polished-gemstone-visual', color: [0.361, 0.209, 0.485], roughness: 0.018, ior: 1.544, transmission: 1, words: /ametrine/i },
  { id: 'stone-aquamarine', name: 'Aquamarine', mode: 'closed-dielectric-visual', color: [0.361, 0.738, 0.831], roughness: 0.018, ior: 1.58, transmission: 1, words: /aquamarine|aqua\b/i },
  { id: 'stone-topaz', name: 'Topaz', mode: 'closed-dielectric-visual', color: [0.258, 0.591, 0.776], roughness: 0.018, ior: 1.62, transmission: 1, words: /(swiss[\s_-]*blue[\s_-]*|sky[\s_-]*blue[\s_-]*|blue[\s_-]*)?topaz/i },
  { id: 'stone-citrine', name: 'Citrine', mode: 'closed-dielectric-visual', color: [0.839, 0.521, 0.117], roughness: 0.018, ior: 1.544, transmission: 1, words: /citrine/i },
  { id: 'stone-peridot', name: 'Peridot', mode: 'closed-dielectric-visual', color: [0.407, 0.552, 0.144], roughness: 0.018, ior: 1.65, transmission: 1, words: /peridot/i },
  { id: 'stone-garnet', name: 'Garnet', mode: 'closed-dielectric-visual', color: [0.462, 0.017, 0.041], roughness: 0.018, ior: 1.79, transmission: 1, words: /garnet|rhodolite|almandine|pyrope/i },
  { id: 'stone-spinel', name: 'Spinel', mode: 'closed-dielectric-visual', color: [0.323, 0.212, 0.407], roughness: 0.018, ior: 1.718, transmission: 1, words: /spinel/i },
  { id: 'stone-tourmaline', name: 'Tourmaline', mode: 'closed-dielectric-visual', color: [0.112, 0.366, 0.231], roughness: 0.018, ior: 1.62, transmission: 1, words: /(green[\s_-]*)?tourmaline|verdelite/i },
  { id: 'stone-morganite', name: 'Morganite', mode: 'closed-dielectric-visual', color: [0.847, 0.539, 0.527], roughness: 0.018, ior: 1.58, transmission: 1, words: /morganite/i },
  { id: 'stone-kunzite', name: 'Kunzite', mode: 'closed-dielectric-visual', color: [0.768, 0.451, 0.61], roughness: 0.018, ior: 1.66, transmission: 1, words: /kunzite/i },
  { id: 'stone-alexandrite', name: 'Alexandrite', mode: 'closed-dielectric-visual', color: [0.112, 0.342, 0.309], roughness: 0.018, ior: 1.745, transmission: 1, words: /alexandrite/i },
  { id: 'stone-iolite', name: 'Iolite', mode: 'closed-dielectric-visual', color: [0.195, 0.195, 0.456], roughness: 0.018, ior: 1.54, transmission: 1, words: /iolite/i },
  { id: 'stone-zircon', name: 'Zircon', mode: 'closed-dielectric-visual', color: [0.665, 0.503, 0.283], roughness: 0.018, ior: 1.94, transmission: 1, words: /(?<!cubic[\s_-]*)zircon(?!ia)/i },
  { id: 'stone-amber', name: 'Amber', mode: 'closed-dielectric-visual', color: [0.68, 0.198, 0.008], roughness: 0.12, ior: 1.54, transmission: 0.72, words: /\bamber/i },
  { id: 'stone-moonstone', neutral: true, name: 'Moonstone', mode: 'polished-cabochon-visual', color: [0.723, 0.799, 0.855], roughness: 0.12, ior: 1.54, transmission: 0.3, words: /moonstone/i },
  { id: 'stone-opal', neutral: true, name: 'Opal', mode: 'polished-cabochon-visual', color: [0.799, 0.799, 0.738], roughness: 0.2, ior: 1.45, transmission: 0.12, words: /opal/i },
  { id: 'stone-rose-quartz', name: 'Rose quartz', mode: 'polished-cabochon-visual', color: [0.723, 0.376, 0.462], roughness: 0.12, ior: 1.54, transmission: 0.3, words: /rose[\s_-]*quartz/i },
  { id: 'stone-sunstone', name: 'Sunstone', mode: 'polished-cabochon-visual', color: [0.584, 0.171, 0.058], roughness: 0.12, words: /sunstone/i },
  { id: 'stone-jade', name: 'Jade', mode: 'polished-cabochon-visual', color: [0.074, 0.296, 0.162], roughness: 0.22, words: /jade|jadeite|nephrite/i },
  { id: 'stone-lapis-lazuli', name: 'Lapis lazuli', mode: 'polished-cabochon-visual', color: [0.009, 0.047, 0.238], roughness: 0.12, words: /lapis/i },
  { id: 'stone-turquoise', name: 'Turquoise', mode: 'polished-cabochon-visual', color: [0.04, 0.381, 0.376], roughness: 0.12, words: /turquoise/i },
  { id: 'stone-pearl', neutral: true, name: 'Pearl', mode: 'nacre-visual', color: [0.855, 0.807, 0.701], roughness: 0.19, words: /pearl(?!.?ized)/i },
  // Coloured varieties jewellers name in their files.
  { id: 'stone-pink-sapphire', name: 'Pink sapphire', mode: 'closed-dielectric-visual', color: [0.78, 0.12, 0.32], roughness: 0.018, ior: 1.77, transmission: 1, words: /pink[\s_-]*sapph?ire/i },
  { id: 'stone-yellow-sapphire', name: 'Yellow sapphire', mode: 'closed-dielectric-visual', color: [0.86, 0.6, 0.06], roughness: 0.018, ior: 1.77, transmission: 1, words: /yellow[\s_-]*sapph?ire/i },
  { id: 'stone-white-sapphire', name: 'White sapphire', mode: 'closed-dielectric-visual', color: [0.96, 0.97, 0.99], roughness: 0.018, ior: 1.77, transmission: 1, words: /white[\s_-]*sapph?ire/i, neutral: true },
  { id: 'stone-padparadscha', name: 'Padparadscha sapphire', mode: 'closed-dielectric-visual', color: [0.9, 0.34, 0.22], roughness: 0.018, ior: 1.77, transmission: 1, words: /padparadscha/i },
  { id: 'stone-pink-diamond', name: 'Pink diamond', mode: 'closed-dielectric-visual', color: [0.88, 0.45, 0.56], roughness: 0.018, ior: 2.417, transmission: 1, words: /pink[\s_-]*diamond/i },
  { id: 'stone-blue-diamond', name: 'Blue diamond', mode: 'closed-dielectric-visual', color: [0.36, 0.56, 0.86], roughness: 0.018, ior: 2.417, transmission: 1, words: /blue[\s_-]*diamond/i },
  { id: 'stone-green-diamond', name: 'Green diamond', mode: 'closed-dielectric-visual', color: [0.36, 0.7, 0.38], roughness: 0.018, ior: 2.417, transmission: 1, words: /green[\s_-]*diamond/i },
  { id: 'stone-champagne-diamond', name: 'Champagne diamond', mode: 'closed-dielectric-visual', color: [0.76, 0.5, 0.26], roughness: 0.018, ior: 2.417, transmission: 1, words: /(champagne|cognac|brown|chocolate)[\s_-]*diamond/i },
  { id: 'stone-black-diamond', name: 'Black diamond', mode: 'closed-dielectric-visual', color: [0.018, 0.018, 0.02], roughness: 0.018, ior: 2.417, transmission: 1, words: /black[\s_-]*diamond/i, neutral: true },
  { id: 'stone-white-topaz', name: 'White topaz', mode: 'closed-dielectric-visual', color: [0.96, 0.97, 0.99], roughness: 0.018, ior: 1.62, transmission: 1, words: /white[\s_-]*topaz/i, neutral: true },
  { id: 'stone-london-blue-topaz', name: 'London blue topaz', mode: 'closed-dielectric-visual', color: [0.04, 0.2, 0.36], roughness: 0.018, ior: 1.62, transmission: 1, words: /london[\s_-]*blue/i },
  { id: 'stone-tsavorite', name: 'Tsavorite', mode: 'closed-dielectric-visual', color: [0.04, 0.55, 0.12], roughness: 0.018, ior: 1.74, transmission: 1, words: /tsavorite|green[\s_-]*garnet/i },
  { id: 'stone-rubellite', name: 'Rubellite', mode: 'closed-dielectric-visual', color: [0.66, 0.05, 0.26], roughness: 0.018, ior: 1.62, transmission: 1, words: /rubellite|pink[\s_-]*tourmaline/i },
  { id: 'stone-paraiba', name: 'Paraíba tourmaline', mode: 'closed-dielectric-visual', color: [0.04, 0.66, 0.7], roughness: 0.018, ior: 1.62, transmission: 1, words: /para[ií]ba/i },
  { id: 'stone-smoky-quartz', name: 'Smoky quartz', mode: 'closed-dielectric-visual', color: [0.3, 0.2, 0.12], roughness: 0.018, ior: 1.544, transmission: 1, words: /smok(e)?y[\s_-]*quartz/i },
  { id: 'stone-onyx', name: 'Onyx', mode: 'polished-cabochon-visual', color: [0.012, 0.012, 0.014], roughness: 0.08, words: /onyx/i, neutral: true },
  { id: 'stone-coral', name: 'Coral', mode: 'polished-cabochon-visual', color: [0.84, 0.2, 0.15], roughness: 0.16, words: /coral/i },
  { id: 'stone-malachite', name: 'Malachite', mode: 'polished-cabochon-visual', color: [0.02, 0.36, 0.16], roughness: 0.14, words: /malachite/i },
  { id: 'stone-mother-of-pearl', name: 'Mother of pearl', mode: 'nacre-visual', color: [0.88, 0.88, 0.86], roughness: 0.2, words: /mother[\s_-]*of[\s_-]*pearl|\bm\.?o\.?p\b|nacre/i, neutral: true },
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

export type GemGuess = { id: string; source: 'name' | 'colour' | 'listing' | 'assumed'; detail: string };

/** A gem named in the object, layer or material names: the most specific name wins ("pink sapphire" over "sapphire"). */
export function gemFromName(text: string): GemGuess | null {
  if (!text) return null;
  let best: { g: Gemstone; word: string } | null = null;
  for (const g of GEMSTONES) { const m = text.match(g.words); if (m && (!best || m[0].length > best.word.length)) best = { g, word: m[0] }; }
  return best ? { id: best.g.id, source: 'name', detail: `named “${best.word}”` } : null;
}

/** Every gem a text names, in the order it names them ("Ruby ring with a diamond halo" → ruby, diamond). */
export function gemsInText(text: string): { id: string; word: string }[] {
  const found: { id: string; word: string; at: number }[] = [];
  for (const g of GEMSTONES) { const re = new RegExp(g.words.source, 'gi'); let m; while ((m = re.exec(text))) found.push({ id: g.id, word: m[0], at: m.index }); }
  // A longer name covers the shorter one inside it ("pink sapphire" covers "sapphire").
  const kept = found.filter(f => !found.some(o => o !== f && o.word.length > f.word.length && o.at <= f.at && o.at + o.word.length >= f.at + f.word.length));
  kept.sort((a, b) => a.at - b.at);
  return kept.filter((f, i) => kept.findIndex(o => o.id === f.id) === i).map(({ id, word }) => ({ id, word }));
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

const toLab = (color: Vec3): [number, number, number] => {
  const [r, g, b] = color.map(v => Math.min(1, Math.max(0, v)));
  const f = (t: number) => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), y = f(0.2126 * r + 0.7152 * g + 0.0722 * b), z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
/** The colours jewellers give these stones in CAD (sRGB hex), used to read a stone from its colour.
 * Only the usual stone for each colour is listed: rarer stones are recognised by name. */
const CAD_COLOURS: [string, string][] = [['stone-ruby', 'd0102a'], ['stone-garnet', '7a1a22'], ['stone-pink-sapphire', 'ff3d8b'], ['stone-morganite', 'f6c2c0'],
  ['stone-citrine', 'ffd81a'], ['stone-peridot', 'a5c832'], ['stone-emerald', '12b84f'], ['stone-aquamarine', '7fd9e0'], ['stone-topaz', '6cb4e4'],
  ['stone-london-blue-topaz', '1f4e79'], ['stone-sapphire', '2050e0'], ['stone-tanzanite', '8060d0'], ['stone-amethyst', '9a4dcc']];
const CAD_POLISHED: [string, string][] = [['stone-turquoise', '30d5c8'], ['stone-lapis-lazuli', '26529c'], ['stone-jade', '00a86b'], ['stone-coral', 'ff7f50']];
const hexLinear = (hex: string) => [0, 2, 4].map(i => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }) as Vec3;
const COLOUR_FACETED = CAD_COLOURS.map(([id]) => id), COLOUR_POLISHED = CAD_POLISHED.map(([id]) => id);
const CAD_LAB = new Map([...CAD_COLOURS, ...CAD_POLISHED].map(([id, hex]) => [id, toLab(hexLinear(hex))]));
const COLOUR_WORDS: [number, string][] = [[15, 'red'], [40, 'orange'], [68, 'yellow'], [95, 'yellow-green'], [165, 'green'], [200, 'teal'], [250, 'blue'], [300, 'violet'], [345, 'pink'], [361, 'red']];
/**
 * The stone colour a jeweller gave a gem in CAD, matched to the closest of the app's gem colours
 * (CIELAB distance, chroma weighted so a vivid red finds ruby and a dark red finds garnet).
 * Faceted stones match transparent gems; polished ones any gem. White and grey stay diamonds.
 */
export function gemFromColour(color: Vec3 | null, faceted = true): GemGuess | null {
  if (!color) return null;
  const [L, a, b] = toLab(color), chroma = Math.hypot(a, b), [h, , l] = hsl(color);
  const word = (lead: string) => ({ source: 'colour' as const, detail: `coloured ${lead} in the file` });
  if (chroma < 10) {
    // Black stones: black diamond when faceted, onyx when polished. White and grey: no colour cue.
    if (L < 18) return faceted ? { id: 'stone-black-diamond', ...word('black') } : { id: 'stone-onyx', ...word('black') };
    if (!faceted && L > 75) return { id: 'stone-pearl', ...word('white') };
    return null;
  }
  // The usual stone for each colour; rarer stones are recognised by name only.
  const candidates = (faceted ? COLOUR_FACETED : [...COLOUR_FACETED, ...COLOUR_POLISHED]).map(id => GEM_BY_ID.get(id)!);
  const hue = (x: number, y: number) => (Math.atan2(y, x) * 180 / Math.PI + 360) % 360, h0 = hue(a, b);
  let best = candidates[0], score = Infinity;
  for (const g of candidates) {
    const [L2, a2, b2] = CAD_LAB.get(g.id)!, dh = Math.abs(((hue(a2, b2) - h0 + 540) % 360) - 180);
    const d = (dh / 25) ** 2 + ((L - L2) / 35) ** 2 + ((chroma - Math.hypot(a2, b2)) / 90) ** 2 + (faceted || COLOUR_POLISHED.includes(g.id) ? 0 : 0.15);
    if (d < score) { score = d; best = g; }
  }
  const name = (COLOUR_WORDS.find(([limit]) => h < limit)?.[1] || 'coloured');
  return { id: best.id, ...word(`${l > 0.7 ? 'light ' : l < 0.25 ? 'dark ' : ''}${name}`) };
}

/** A colour no jewellery metal has (black, or a clear colour other than gold and rose tones): a stone, not metal. */
export function stoneColour(color: Vec3 | null): boolean {
  if (!color) return false;
  const [L, a, b] = toLab(color), chroma = Math.hypot(a, b), [h] = hsl(color);
  if (L < 18) return true;
  const metallic = h >= 10 && h <= 65 && L > 50 && chroma < 70;
  return chroma > 30 && !metallic;
}

/** A stone's type: its name first, then the colour it was given, otherwise a diamond. */
export function deduceGem(hint: string, color: Vec3 | null, faceted = true): GemGuess {
  return gemFromName(hint) || gemFromColour(color, faceted) || (faceted ? { id: 'stone-diamond', source: 'assumed', detail: 'no colour or name in the file' }
    : { id: 'stone-pearl', source: 'assumed', detail: 'a polished stone with no colour or name in the file' });
}
