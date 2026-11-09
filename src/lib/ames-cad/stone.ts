// Browser: a loose stone as an AMES web model, from the dealer's scan or from its shape and measurements.
// Rough crystals keep their scanned surface with a frosted natural-crystal look; polished stones keep
// their scanned facets, or are built from the shape as a representative studio cut.
import { BufferAttribute, BufferGeometry, Color, Group, LinearSRGBColorSpace, Mesh, MeshPhysicalMaterial, Scene, Vector3 } from 'three';
import { mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { MeshoptSimplifier } from 'meshoptimizer';
import { createStudioBrilliantGeometry } from '../../../node_modules/ames-engine/src/engine/jewelry/createStudioBrilliantGeometry';
import { gem, gemsInText } from './gems';
import { loadCad, type Units } from './load';
import { renderPoster } from './poster';
import type { Cut } from './geometry';

/** What the converter needs to know about a dealer's stone. */
export type StoneSpecs = { ref: string; form: 'rough' | 'polished'; shape: string; carat: number; color: string; measurements?: string; describe?: string };
export type StoneModel = { glb: Uint8Array; poster: Blob; source: 'scan' | 'specs'; gemId: string; size: [number, number, number]; triangles: number; note: string };

const SCAN_BUDGET = 250000;
const linear = (rgb: readonly number[]) => new Color().setRGB(rgb[0], rgb[1], rgb[2], LinearSRGBColorSpace);

/** The gem a stone's colour and description name (a "Fancy yellow" diamond, a "Ruby"); otherwise a diamond. */
export function stoneGem(specs: StoneSpecs): string {
  const named = gemsInText(`${specs.describe || ''} ${specs.color}`)[0]?.id;
  if (named) return named;
  if (/fancy|yellow|canary/i.test(specs.color)) return 'stone-fancy-color-diamond';
  if (/pink/i.test(specs.color)) return 'stone-pink-diamond';
  if (/blue/i.test(specs.color)) return 'stone-blue-diamond';
  if (/brown|champagne|cognac/i.test(specs.color)) return 'stone-champagne-diamond';
  if (/black/i.test(specs.color)) return 'stone-black-diamond';
  return 'stone-diamond';
}

/** Polished: the app's look for the gem. Rough: a frosted natural crystal of that gem. */
function stoneMaterial(id: string, rough: boolean) {
  const g = gem(id);
  if (rough) {
    // Lighter body tint: rough crystals read pale through their frosted skin.
    const tint = id === 'stone-diamond' ? [0.93, 0.94, 0.92] : g.color.map(v => 0.35 + 0.65 * v);
    return new MeshPhysicalMaterial({ name: `Rough ${g.name.toLowerCase()} | natural crystal`, color: linear(tint), metalness: 0, roughness: 0.34, transmission: 0.22, thickness: 1, ior: g.ior ?? 1.6, clearcoat: 0.45, clearcoatRoughness: 0.4 });
  }
  return new MeshPhysicalMaterial({ name: `${g.name} | ${g.mode === 'closed-dielectric-visual' ? 'closed dielectric' : 'polished stone'}`, color: linear(g.color), metalness: 0, roughness: g.roughness, ior: g.ior ?? 1.54, transmission: g.transmission ?? 0 });
}

async function writeGlb(geometry: BufferGeometry, specs: StoneSpecs, id: string, rough: boolean, source: 'scan' | 'specs', shape: string) {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const scene = new Scene(), root = new Group(); root.name = 'AMES stone (authored in mm)'; root.scale.setScalar(0.001); scene.add(root);
  root.userData = { ames_stone_ref: specs.ref, ames_stone_source: source };
  const mesh = new Mesh(geometry, stoneMaterial(id, rough)); mesh.name = rough ? 'Rough crystal' : `${gem(id).name} ${shape}`;
  // Polished stones go through the viewer's refraction path; rough crystals keep their frosted material.
  mesh.userData = rough ? { ames_rough: true, ames_gemstone_id: id } : { ames_optical_mode: gem(id).mode, ames_gemstone_id: id, ames_shape: shape };
  root.add(mesh);
  return new Uint8Array(await new GLTFExporter().parseAsync(scene, { binary: true }) as ArrayBuffer);
}

const STONE_VIEW: [number, number] = [25, 52];
function measure(g: BufferGeometry): [number, number, number] { g.computeBoundingBox(); const s = g.boundingBox!.getSize(new Vector3()); return [s.x, s.y, s.z]; }

/** A dealer's scan (Sarine, Helium and similar scanners export STL, OBJ or PLY) as the stone's 3D. */
export async function convertStoneScan(file: File, specs: StoneSpecs, options: { units?: Units; gemId?: string; onStep?: (s: string) => void } = {}): Promise<StoneModel> {
  const step = (s: string) => { options.onStep?.(s); return new Promise(r => setTimeout(r, 0)); };
  await step('Reading the scan…');
  const { parts } = await loadCad(file, options.units);
  const count = parts.reduce((n, p) => n + p.positions.length, 0), pos = new Float32Array(count); let o = 0;
  for (const p of parts) { pos.set(p.positions, o); o += p.positions.length; }
  let g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(pos, 3)); g.computeBoundingBox();
  const centre = g.boundingBox!.getCenter(new Vector3()); g.translate(-centre.x, -centre.y, -centre.z);
  const size = measure(g), largest = Math.max(...size);
  if (largest < 0.5 || largest > 120) throw new Error(`The scan measures ${size.map(v => v.toFixed(1)).join(' × ')} mm. Choose the file's units if it is not in millimetres.`);
  const rough = specs.form === 'rough';
  await step('Building the stone…');
  g = mergeVertices(toCreasedNormals(g, rough ? Math.PI / 3 : Math.PI / 9), 1e-4);
  const triangles = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  if (triangles > SCAN_BUDGET && g.index) {
    await MeshoptSimplifier.ready;
    const [index] = MeshoptSimplifier.simplify(new Uint32Array(g.index.array), new Float32Array(g.getAttribute('position').array), 3, SCAN_BUDGET * 3, 0.0002);
    g.setIndex(new BufferAttribute(index, 1)); g.computeVertexNormals();
  }
  const id = options.gemId || stoneGem(specs), glb = await writeGlb(g, specs, id, rough, 'scan', rough ? 'rough crystal' : 'as scanned');
  await step('Photographing it for the catalogue…');
  const poster = await renderPoster(glb, 'accessory', 900, STONE_VIEW);
  return { glb, poster, source: 'scan', gemId: id, size, triangles: Math.round((g.index ? g.index.count : g.getAttribute('position').count) / 3), note: rough ? 'From the dealer’s scan of the rough crystal.' : 'From the dealer’s scan, with its own facets.' };
}

// ── Polished stones from their shape and measurements ──
type Shape = { cut: Cut | 'step' | 'marquise'; label: string; aspect: number; depth: number };
function shapeOf(text: string): Shape {
  const t = text.toLowerCase();
  if (/emerald|step|baguette/.test(t)) return { cut: 'step', label: /baguette/.test(t) ? 'baguette' : 'emerald cut', aspect: /baguette/.test(t) ? 2.2 : 1.4, depth: 0.66 };
  if (/asscher|square step/.test(t)) return { cut: 'step', label: 'asscher', aspect: 1, depth: 0.66 };
  if (/marquise|navette/.test(t)) return { cut: 'marquise', label: 'marquise', aspect: 2, depth: 0.6 };
  if (/pear|drop/.test(t)) return { cut: 'pear', label: 'pear', aspect: 1.55, depth: 0.6 };
  if (/oval/.test(t)) return { cut: 'oval', label: 'oval', aspect: 1.4, depth: 0.6 };
  if (/cushion/.test(t)) return { cut: 'cushion', label: 'cushion', aspect: 1.05, depth: 0.66 };
  if (/radiant/.test(t)) return { cut: 'radiant', label: 'radiant', aspect: 1.25, depth: 0.66 };
  if (/princess|square/.test(t)) return { cut: 'radiant', label: 'princess', aspect: 1, depth: 0.7 };
  return { cut: 'round', label: /heart|trillion|triangle/.test(t) ? `${t.match(/heart|trillion|triangle/)![0]} (shown as round)` : 'round brilliant', aspect: 1, depth: 0.615 };
}
/** Length × width × depth in mm from "6.52 x 6.49 x 4.01 mm"-style measurements, or estimated from the carat weight. */
/** Specific gravity: a carat of a denser gem is smaller. Diamond 3.52. */
const DENSITY: Record<string, number> = { 'stone-ruby': 4.0, 'stone-sapphire': 4.0, 'stone-pink-sapphire': 4.0, 'stone-yellow-sapphire': 4.0, 'stone-white-sapphire': 4.0, 'stone-padparadscha': 4.0,
  'stone-emerald': 2.72, 'stone-aquamarine': 2.7, 'stone-morganite': 2.8, 'stone-amethyst': 2.65, 'stone-citrine': 2.65, 'stone-smoky-quartz': 2.65, 'stone-rose-quartz': 2.65, 'stone-ametrine': 2.65,
  'stone-garnet': 3.9, 'stone-tsavorite': 3.6, 'stone-spinel': 3.6, 'stone-tourmaline': 3.06, 'stone-rubellite': 3.06, 'stone-paraiba': 3.06, 'stone-peridot': 3.34, 'stone-tanzanite': 3.35,
  'stone-zircon': 4.6, 'stone-alexandrite': 3.73, 'stone-kunzite': 3.18, 'stone-iolite': 2.6, 'stone-opal': 2.1 };
export function stoneSize(specs: StoneSpecs, shape: Shape, gemId = 'stone-diamond'): { l: number; w: number; d: number; measured: boolean } {
  const n = (specs.measurements || '').match(/\d+(?:[.,]\d+)?/g)?.map(v => Number(v.replace(',', '.'))).filter(v => v > 0.3 && v < 80) || [];
  if (n.length >= 3) { const [a, b, c] = n; return { l: Math.max(a, b), w: Math.min(a, b), d: c, measured: true }; }
  // A 1 ct round brilliant is about 6.4 mm across; size scales with the cube root of the weight.
  const round = 6.4 * Math.cbrt(Math.max(0.01, specs.carat || 1) * 3.52 / (DENSITY[gemId] || 3.52)), w = round / Math.sqrt(shape.aspect) * (shape.cut === 'step' ? 0.92 : 1);
  return { l: w * shape.aspect, w, d: w * shape.depth, measured: false };
}
function stepCut(): BufferGeometry {
  // An emerald-style step cut: three crown steps, a girdle and a pavilion keel, corners cut at 18%.
  // The girdle is knife-thin, as on a well-cut stone: a tall polished band shows as a bright line round it.
  const pts: Vector3[] = [], c = 0.18;
  const ring = (s: number, y: number) => { const h = s / 2, k = c * s; for (const [x, z] of [[h - k, h], [h, h - k], [h, -h + k], [h - k, -h], [-h + k, -h], [-h, -h + k], [-h, h - k], [-h + k, h]]) pts.push(new Vector3(x, y, z)); };
  for (const [s, y] of [[0.62, 0.34], [0.8, 0.24], [0.93, 0.12], [1, 0.006], [1, -0.006], [0.78, -0.22], [0.52, -0.42], [0.2, -0.6]] as const) ring(s, y);
  pts.push(new Vector3(0, -0.66, 0));
  return new ConvexGeometry(pts);
}
function marquiseCut(): BufferGeometry {
  const pts: Vector3[] = [], n = 32;
  for (const [r, h, off] of [[0.02, -0.62, 0], [1, -0.006, 0], [1, 0.006, 0], [0.78, 0.17, 0.5], [0.53, 0.34, 0]] as const)
    for (let i = 0; i < n; i++) { const a = (i + off) * Math.PI * 2 / n, z = Math.sin(a), x = Math.cos(a) * Math.pow(Math.max(0, 1 - Math.abs(z)), 0.55); pts.push(new Vector3(x * r, h, z * r)); }
  return new ConvexGeometry(pts);
}

/** A representative 3D of a polished stone from its shape, measurements (or carat) and colour. */
export async function buildStoneFromSpecs(specs: StoneSpecs, options: { gemId?: string; onStep?: (s: string) => void } = {}): Promise<StoneModel> {
  const shape = shapeOf(specs.shape), id = options.gemId || stoneGem(specs), size = stoneSize(specs, shape, id);
  options.onStep?.('Cutting the stone…'); await new Promise(r => setTimeout(r, 0));
  const g = shape.cut === 'step' ? stepCut() : shape.cut === 'marquise' ? marquiseCut() : createStudioBrilliantGeometry(shape.cut).clone();
  g.computeBoundingBox(); const b = g.boundingBox!, s = b.getSize(new Vector3()), mid = b.getCenter(new Vector3());
  g.translate(-mid.x, -mid.y, -mid.z); g.scale(size.w / s.x, size.d / s.y, size.l / s.z);
  const glb = await writeGlb(g, specs, id, false, 'specs', shape.label);
  options.onStep?.('Photographing it for the catalogue…');
  const poster = await renderPoster(glb, 'accessory', 900, STONE_VIEW);
  const triangles = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  return { glb, poster, source: 'specs', gemId: id, size: [size.w, size.d, size.l], triangles: Math.round(triangles),
    note: `Representative ${shape.label} built from ${size.measured ? 'the stated measurements' : `the ${specs.carat} ct weight (measurements estimated)`}; not a scan of this stone.` };
}
