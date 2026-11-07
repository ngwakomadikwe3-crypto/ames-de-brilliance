// Browser entry: CAD file → AMES web model, tile image and detected category, all on the jeweller's device.
import { analyse, samplePoints } from './geometry';
import { classify, type Classification } from './classify';
import { buildPieceGlb, type MetalChoice, type BuildReport } from './build';
import { loadCad, type Units } from './load';
import { renderPoster } from './poster';

export type ConversionResult = {
  glb: Uint8Array; poster: Blob; classification: Classification; report: BuildReport & { unit: string; unitSource: string; size: [number, number, number]; sourceTriangles: number; cuts: Record<string, number> };
};
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
  await step('Building the 3D model…');
  const { glb, report } = await buildPieceGlb(parts, analysis, { metal: options.metal, sourceNames: names });
  await step('Photographing it for the Boutique…');
  const poster = await renderPoster(glb, classification.category);
  const cuts: Record<string, number> = {}; for (const s of analysis.stones) { const k = s.melee ? 'melee' : s.cut; cuts[k] = (cuts[k] || 0) + 1; }
  return { glb, poster, classification, report: { ...report, unit, unitSource, size: analysis.size, sourceTriangles: analysis.triangles, cuts } };
}
