// Collections: the rules, with no app dependencies (tested in scripts/test-collections.mjs).
//
// A collection is data: { id, name, description, pieces: design codes, ... }. It never has models or design data
// of its own; it assembles existing designs. Sets of 2 to 4 pieces, themed defaults (an all-sapphire set) and
// seasonal windows are all just fields on the entry.

export type Choice = Record<string, string>;
export interface OptionLike { key: string; label: string; choices: string[] }
export interface DesignLike { code: string; name: string; category: string; options: OptionLike[] }

export interface CollectionEntry {
  id: string;
  name: string;
  description: string;
  /** Design codes, in the order they are shown (2 to 4 pieces). */
  pieces: string[];
  /** Shared choices the set opens with, e.g. { accent: 'Sapphire' } for an all-sapphire set. */
  defaults?: Choice;
  /** Seasonal window (ISO dates, inclusive). Outside it the collection is not listed. */
  season?: { from?: string; until?: string; label?: string };
  /** Hero still-life arrangement in the 3D scene (optional; a standard layout is used otherwise). */
  hero?: { rotation?: number };
}

/** Choices that apply across the whole set at once. */
export const SHARED_KEYS = ['metal', 'stones', 'accent'] as const;
export const MIN_PIECES_FOR_DISCOUNT = 2;
export const DEFAULT_SET_DISCOUNT = 10;          // percent; the owner sets the real figure (collection settings)
export const DISCOUNT_RANGE = { min: 1, max: 50 }; // never 0: buying the set must always cost less

export function isActive(entry: CollectionEntry, today = new Date()) {
  const day = today.toISOString().slice(0, 10);
  if (entry.season?.from && day < entry.season.from) return false;
  if (entry.season?.until && day > entry.season.until) return false;
  return entry.pieces.length >= 2;
}

/** The shared controls for a set: every shared option at least two pieces have, with the choices they share. */
export function sharedOptions(designs: DesignLike[]): OptionLike[] {
  const out: OptionLike[] = [];
  for (const key of SHARED_KEYS) {
    const withKey = designs.map(d => d.options.find(o => o.key === key)).filter((o): o is OptionLike => !!o);
    if (withKey.length < 2) continue;
    // offer the union, in first-seen order; a piece that cannot take a choice keeps its own (and says so)
    const choices = [...new Set(withKey.flatMap(o => o.choices))];
    out.push({ key, label: withKey[0].label, choices });
  }
  return out;
}

export interface ResolvedPiece {
  code: string;
  design: DesignLike;
  choice: Choice;
  /** keys set on this piece only, overriding the shared choice */
  overridden: string[];
  /** shared choices this piece cannot take (kept at its own value) */
  unavailable: string[];
}

/** Every piece's configuration: its own override, else the shared choice (if the piece offers it), else its default. */
export function resolveSet(designs: DesignLike[], shared: Choice, overrides: Record<string, Choice> = {}): ResolvedPiece[] {
  return designs.map(design => {
    const own = overrides[design.code] ?? {}, choice: Choice = {}, overridden: string[] = [], unavailable: string[] = [];
    for (const o of design.options) {
      if (own[o.key] !== undefined && o.choices.includes(own[o.key])) { choice[o.key] = own[o.key]; overridden.push(o.key); continue; }
      const s = shared[o.key];
      if (s !== undefined && o.choices.includes(s)) { choice[o.key] = s; continue; }
      if (s !== undefined) unavailable.push(o.key);
      choice[o.key] = o.choices[0];
    }
    return { code: design.code, design, choice, overridden, unavailable };
  });
}

/** Setting a shared choice clears that key's per-piece overrides, so "choose yellow gold" really changes every piece. */
export function applyShared(shared: Choice, overrides: Record<string, Choice>, key: string, value: string) {
  const nextOverrides: Record<string, Choice> = {};
  for (const [code, own] of Object.entries(overrides)) { const { [key]: _drop, ...rest } = own; void _drop; if (Object.keys(rest).length) nextOverrides[code] = rest; }
  return { shared: { ...shared, [key]: value }, overrides: nextOverrides };
}

export function setOverride(overrides: Record<string, Choice>, code: string, key: string, value: string | undefined) {
  const own = { ...(overrides[code] ?? {}) };
  if (value === undefined) delete own[key]; else own[key] = value;
  const next = { ...overrides };
  if (Object.keys(own).length) next[code] = own; else delete next[code];
  return next;
}

export type Money = { currency: string; amount: number };
export interface BundlePrice {
  /** all included pieces have a published price, in one currency */
  complete: boolean;
  currency: string | null;
  subtotal: number | null;      // the pieces bought separately
  discountPercent: number;      // applied percent (0 when fewer than two pieces)
  discount: number | null;
  total: number | null;
  pieces: number;
  missing: number;              // pieces still awaiting a published price
}

export const clampDiscount = (pct: number) => (Number.isFinite(pct) ? Math.min(DISCOUNT_RANGE.max, Math.max(DISCOUNT_RANGE.min, pct)) : DEFAULT_SET_DISCOUNT);

/** Sum of the included pieces minus the set discount; the discount applies only with two or more pieces. */
export function bundlePrice(prices: (Money | null)[], discountPercent: number): BundlePrice {
  const pieces = prices.length, missing = prices.filter(p => !p).length;
  const pct = pieces >= MIN_PIECES_FOR_DISCOUNT ? clampDiscount(discountPercent) : 0;
  const known = prices.filter((p): p is Money => !!p);
  const currencies = new Set(known.map(p => p.currency));
  const complete = missing === 0 && pieces > 0 && currencies.size === 1;
  if (!complete) return { complete, currency: currencies.size === 1 ? [...currencies][0] : null, subtotal: null, discountPercent: pct, discount: null, total: null, pieces, missing };
  const subtotal = round2(known.reduce((sum, p) => sum + p.amount, 0));
  const discount = round2(subtotal * pct / 100), total = round2(subtotal - discount);
  return { complete, currency: known[0].currency, subtotal, discountPercent: pct, discount, total, pieces, missing };
}
const round2 = (n: number) => Math.round(n * 100) / 100;

/** One quote request for the whole package (or what is left of it). */
export function packageRequest(entry: CollectionEntry, pieces: { code: string; name: string; configuration: string }[], price: BundlePrice) {
  const removed = entry.pieces.filter(code => !pieces.some(p => p.code === code));
  const lines = [
    `Collection: ${entry.name} (${entry.id})${removed.length ? ` without ${removed.join(', ')}` : ''}`,
    ...pieces.map((p, i) => `${i + 1}. ${p.configuration}`),
    price.discountPercent ? `Set discount: ${price.discountPercent}% on ${pieces.length} pieces` : 'No set discount (fewer than two pieces)',
    price.complete ? `Package price: ${price.currency} ${price.total!.toFixed(2)} (pieces separately ${price.subtotal!.toFixed(2)})` : 'Package price to be confirmed by the house',
  ];
  return lines.join('\n');
}
