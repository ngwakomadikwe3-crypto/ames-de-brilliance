// The rules every set of identity weights obeys before it touches the mesh (scan solve, fine-tune, the morph lab):
//  - one scalar weight per named target, applied to that target's baked delta, nothing else;
//  - opposing pairs (…-decr / …-incr, …-down / …-up, …-in / …-out, …-backward / …-forward) are ONE axis in [-1, 1]:
//    never both halves at once;
//  - each feature target is limited to its sane range: the weight at which it moves the skin at most SANE_MM
//    (MakeHuman's targets reach caricature at 1.0: the forehead bulge moves 58 mm, the brow ridge 16 mm);
//  - the six ancestry/sex shapes are a mix: they sum to exactly 1; age is at most 1.
export const SANE_MM = 9;
const PAIRS: [string, string][] = [['-decr', '-incr'], ['-down', '-up'], ['-in', '-out'], ['-backward', '-forward']];

export type Axis = { id: string; label: string; neg?: string; pos: string };
/** The identity targets as axes (pairs merged), for sliders and sanitising. */
export function identityAxes(names: string[]): Axis[] {
  const used = new Set<string>(), out: Axis[] = [];
  for (const n of names) {
    if (used.has(n)) continue;
    let axis: Axis | null = null;
    for (const [a, b] of PAIRS) {
      // (the id names the pair too: eyebrows-trans has both down/up and backward/forward axes)
      if (n.endsWith(a) && names.includes(n.slice(0, -a.length) + b)) axis = { id: n.slice(0, -a.length) + b.replace('-', ':'), label: '', neg: n, pos: n.slice(0, -a.length) + b };
      else if (n.endsWith(b) && names.includes(n.slice(0, -b.length) + a)) axis = { id: n.slice(0, -b.length) + b.replace('-', ':'), label: '', neg: n.slice(0, -b.length) + a, pos: n };
      if (axis) break;
    }
    axis ??= { id: n, label: '', pos: n };
    if (axis.neg) used.add(axis.neg); used.add(axis.pos);
    axis.label = axis.id.replace(/^id:/, '').replace(/:incr$/, '').replace(/:/g, ' → ').replace(/-/g, ' ');
    out.push(axis);
  }
  return out;
}
export const isMacro = (n: string) => n.startsWith('id:base-');
const exempt = (n: string) => isMacro(n) || n === 'id:age-old' || n.startsWith('ex:');

/** The largest weight at which each target stays within SANE_MM (1 for the macro shapes, age and expressions). */
export function saneLimits(maxDisplacementMm: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const [n, d] of Object.entries(maxDisplacementMm)) out[n] = exempt(n) ? 1 : Math.min(1, SANE_MM / Math.max(1e-6, d));
  return out;
}

/** Make a set of weights obey the rules (returns a new object). */
export function sanitizeWeights(w: Record<string, number>, names: string[], limits?: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const ax of identityAxes(names)) {
    const net = (w[ax.pos] ?? 0) - (ax.neg ? w[ax.neg] ?? 0 : 0);
    const lim = (n: string) => limits?.[n] ?? 1;
    if (net > 0) out[ax.pos] = Math.min(net, lim(ax.pos));
    else if (net < 0 && ax.neg) out[ax.neg] = Math.min(-net, lim(ax.neg));
  }
  const macros = names.filter(isMacro), sum = macros.reduce((a, n) => a + (out[n] ?? 0), 0);
  for (const n of macros) out[n] = sum > 1e-6 ? (out[n] ?? 0) / sum : 1 / macros.length;
  if (out['id:age-old'] !== undefined) out['id:age-old'] = Math.min(1, out['id:age-old']);
  for (const k of Object.keys(out)) if (!(out[k] > 1e-4)) delete out[k];
  return out;
}
