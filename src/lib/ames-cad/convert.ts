// Browser entry: CAD file → AMES web model, tile image and detected category, all on the jeweller's device.
import { analyse, samplePoints, type Stone } from './geometry';
import { classify, type Classification } from './classify';
import { buildPieceGlb, type GemAssignment, type MetalChoice, type BuildReport } from './build';
import { gem } from './gems';
import { loadCad, type Units } from './load';
import { renderPoster } from './poster';

/** Stones shown to the jeweller for confirmation: one row per centre stone, matching side stones or pavé. */
export type StoneGroup = { key: string; label: string; shape: string; size: string; count: number; indices: number[];
  gem: string; source: 'name' | 'colour' | 'assumed' | 'chosen'; reason: string; ownFacets: boolean };
export type ConversionResult = {
  glb: Uint8Array; poster: Blob; classification: Classification; stones: StoneGroup[];
  report: BuildReport & { unit: string; unitSource: string; size: [number, number, number]; sourceTriangles: number; cuts: Record<string, number> };
  /** Rebuild the model and image with the jeweller's gemstone choices (group key → gemstone id). */
  regem: (choices: Record<string, string>) => Promise<ConversionResult>;
};

const mm = (v: number) => (Math.round(v * 10) / 10).toString();
function groupStones(stones: Stone[]): StoneGroup[] {
  const groups = new Map<string, StoneGroup>(), hero = stones.map((s, i) => ({ s, i })).filter(x => !x.s.melee).sort((a, b) => b.s.width - a.s.width);
  const centre = hero.length && (hero.length === 1 || hero[0].s.width > 1.3 * hero[1].s.width) ? hero[0].i : -1;
  stones.forEach((s, i) => {
    const size = s.length / s.width > 1.08 ? `${mm(s.length)} × ${mm(s.width)} mm` : `${mm(s.width)} mm`;
    const key = i === centre ? 'centre' : s.melee ? `${s.cut ? 'pave' : `accent:${s.shape}`}:${s.gem.id}` : `side:${s.shape}:${s.gem.id}:${Math.round(s.width * 2)}`;
    let g = groups.get(key);
    if (!g) groups.set(key, g = { key, label: i === centre ? 'Centre stone' : s.melee ? (s.cut ? 'Pavé' : 'Accent stones') : 'Side stones', shape: s.melee && s.cut ? 'round' : s.shape, size, count: 0, indices: [],
      gem: s.gem.id, source: s.gem.source, reason: s.gem.detail, ownFacets: !s.cut });
    g.count++; g.indices.push(i);
    if (s.melee && g.count > 1) { const w = g.indices.map(k => stones[k].width); g.size = `${mm(Math.min(...w))}–${mm(Math.max(...w))} mm`; }
  });
  const order = (g: StoneGroup) => g.key === 'centre' ? 0 : g.label === 'Side stones' ? 1 : g.label === 'Pavé' ? 3 : 2;
  return [...groups.values()].sort((a, b) => order(a) - order(b) || b.count - a.count).map(g => g.label === 'Side stones' && g.count === 1 ? { ...g, label: 'Stone' } : g);
}

export async function convertCad(file: File, options: { units?: Units; metal?: MetalChoice; listingName?: string; onStep?: (step: string) => void } = {}): Promise<ConversionResult> {
  const step = (s: string) => { options.onStep?.(s); return new Promise(r => setTimeout(r, 0)); };
  if (file.size > 150 * 1024 * 1024) throw new Error('This file is over 150 MB. Export a lighter mesh (or a GLB) from your CAD program.');
  await step('Reading your file…');
  const { parts, unit, unitSource, names } = await loadCad(file, options.units);
  await step('Finding the metal and every stone…');
  const analysis = analyse(parts);
  if (analysis.triangles > 4_000_000) throw new Error('This model has more than 4 million triangles. Reduce the mesh density on export and try again.');
  const pts = samplePoints(parts, analysis.shells, analysis.shells.map((_, i) => i));
  const metalParts = analysis.metalShells.map(i => { const s = analysis.shells[i]; return [0, 1, 2].map(k => s.max[k] - s.min[k]).sort((x, y) => y - x); });
  const classification = classify({ points: pts, metalParts, stones: analysis.stones, names: `${options.listingName || ''} ${names}` });
  const detected = groupStones(analysis.stones);
  const cuts: Record<string, number> = {}; for (const s of analysis.stones) { const k = s.melee ? 'melee' : s.shape; cuts[k] = (cuts[k] || 0) + 1; }

  const make = async (choices: Record<string, string>): Promise<ConversionResult> => {
    const assignment: GemAssignment = {};
    const stones = detected.map(g => { const id = choices[g.key]; if (!id || id === g.gem) return g; for (const i of g.indices) assignment[i] = id; return { ...g, gem: id, source: 'chosen' as const, reason: `chosen by you (detected: ${gem(g.gem).name})` }; });
    await step('Building the 3D model…');
    const { glb, report } = await buildPieceGlb(parts, analysis, { metal: options.metal, sourceNames: names, gems: assignment });
    await step('Photographing it for the Boutique…');
    const poster = await renderPoster(glb, classification.category);
    return { glb, poster, classification, stones, report: { ...report, unit, unitSource, size: analysis.size, sourceTriangles: analysis.triangles, cuts }, regem: next => make({ ...choices, ...next }) };
  };
  return make({});
}
