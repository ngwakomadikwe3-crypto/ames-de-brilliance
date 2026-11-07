// Browser: write an analysed CAD piece as an AMES model (three.js GLB): tagged stones, pavé layout, metal.
// The server checks and compresses it (see check.ts), so nothing here needs Node.
import { BufferAttribute, BufferGeometry, CanvasTexture, Color, Group, LinearSRGBColorSpace, Matrix4, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Quaternion, Scene, SRGBColorSpace, Vector3, type Texture } from 'three';
import { mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { MeshoptSimplifier } from 'meshoptimizer';
import type { Analysis, Cut, Shell, SourcePart, Stone, Vec3 } from './geometry';
import { ENGINE_RECUT_IDS, gem, isSurfaceGem } from './gems';
import type { Rig } from './rig';
import { createStudioBrilliantGeometry } from '../../../node_modules/ames-engine/src/engine/jewelry/createStudioBrilliantGeometry';

export type MetalChoice = 'auto' | 'white' | 'yellow' | 'rose';
/** Metal parts never carry a texture over: AMES gives metal its own polish. */
const METAL_WORDS_FOR_TEXTURE = /gold|platinum|silver|metal|alloy|rhodium|palladium|titanium|steel|prong|claw|shank|band|bezel|chain|clasp/i;
const OTHER_WORDS = /enamel|pearl|dial|leather|strap|wood|ceramic|resin|lacquer|onyx|jade|coral|mother.?of.?pearl|rubber|fabric|suede|velvet|cloth|lining|thread|stitch|felt|cushion|pillow|silk|cotton|canvas|plastic|acrylic|glass|foam|paper|card/i;
const METALS = {
  white: { name: 'White gold | visual study', color: [0.87, 0.86, 0.84] },
  yellow: { name: 'Yellow gold | visual study', color: [0.94, 0.75, 0.42] },
  rose: { name: 'Rose gold | visual study', color: [0.92, 0.64, 0.55] },
} as const;
/** Metal finishes named in CAD names: the viewer shows them with this roughness (polished metal otherwise). */
const FINISHES: [RegExp, string, number][] = [[/brushed|satin|florentine|hairline/i, 'Brushed', 0.32], [/\bmatt?e?\b|frosted|sand[\s_-]*blast|bead[\s_-]*blast/i, 'Matte', 0.5], [/hammered/i, 'Hammered', 0.18]];
/** At most this many textured surfaces (the server check allows four images). */
const MAX_TEXTURES = 4, TEXTURE_SIZE = 1024;
/** A texture image redrawn at web size (never above 1024 px), keeping its orientation for the exporter. */
function webTexture(map: Texture): Texture | null {
  const image = map.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!image?.width || !image.height) return null;
  const k = Math.min(1, TEXTURE_SIZE / Math.max(image.width, image.height)), canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * k)); canvas.height = Math.max(1, Math.round(image.height * k));
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  const t = new CanvasTexture(canvas); t.flipY = map.flipY; t.colorSpace = SRGBColorSpace; t.wrapS = map.wrapS; t.wrapT = map.wrapT; t.userData.mimeType = 'image/jpeg'; return t;
}
/** Web budget for metal after simplification of very dense CAD exports. */
export const METAL_BUDGET = 450000;

/** Read a metal colour from the source material (linear RGB). */
export function metalTone(color: Vec3 | null): keyof typeof METALS {
  if (!color) return 'white';
  const [r, g, b] = color, max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min < 0.12 * Math.max(max, 0.05)) return 'white';
  if (r >= g && g > b && (r - b) / max > 0.3 && g / r > 0.62) return 'yellow';
  if (r > g && (r - g) / r > 0.18) return 'rose';
  return 'white';
}

/** The light melee/placeholder brilliant: unit girdle radius, table +y (same points as the viewer). */
function meleeUnit(): BufferGeometry {
  const pts: Vector3[] = [];
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) * Math.PI / 4; pts.push(new Vector3(0.56 * Math.cos(a), 0.322, 0.56 * Math.sin(a))); }
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; pts.push(new Vector3(Math.cos(a), 0, Math.sin(a))); }
  pts.push(new Vector3(0, -0.886, 0));
  return new ConvexGeometry(pts);
}
const basis = (s: Stone) => new Matrix4().makeBasis(new Vector3(...s.x), new Vector3(...s.y), new Vector3(...s.z));
const linear = (rgb: readonly number[]) => new Color().setRGB(rgb[0], rgb[1], rgb[2], LinearSRGBColorSpace);

export type BuildReport = { metalTriangles: number; heroStones: number; melee: number; metal: string[]; others: number; ownFacets: number; textures: number;
  /** A bracelet split link by link: it can be unclasped and measured in 3D. */
  bracelet?: { links: number; length_mm: number; width_mm: number; clasp: string; kind?: string };
  /** Hinged parts that dangle (earring drops). */
  dangles?: number;
  /** Lids that open (cases, boxes). */
  opens?: number };
/** The app's look for a gemstone, as a glTF material the viewer reads (colour, polish, IOR, transmission). */
function gemMaterial(id: string, cache: Map<string, MeshStandardMaterial>) {
  let m = cache.get(id); if (m) return m;
  const g = gem(id);
  m = g.mode === 'closed-dielectric-visual' || g.transmission
    ? new MeshPhysicalMaterial({ name: `${g.name} | ${g.mode === 'closed-dielectric-visual' ? 'closed dielectric' : 'polished stone'}`, color: linear(g.color), metalness: 0, roughness: g.roughness, ior: g.ior ?? 1.54, transmission: g.transmission ?? 0 })
    : new MeshPhysicalMaterial({ name: `${g.name} | polished stone`, color: linear(g.color), metalness: 0, roughness: g.roughness, clearcoat: g.mode === 'nacre-visual' ? 0.72 : 0.65, clearcoatRoughness: 0.08 });
  cache.set(id, m); return m;
}
const gemExtras = (id: string, more: Record<string, unknown> = {}) => ({ ames_optical_mode: gem(id).mode, ames_gemstone_id: id, ...more });
/** Triangles of one shell as a geometry (mm), with crisp facet normals. */
function shellGeometry(parts: SourcePart[], shell: Shell, angle = Math.PI / 7) {
  const p = parts[shell.part].positions, pos = new Float32Array(shell.triangles.length * 9); let o = 0;
  for (const t of shell.triangles) { pos.set(p.subarray(t * 9, t * 9 + 9), o); o += 9; }
  const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(pos, 3));
  return mergeVertices(toCreasedNormals(g, angle), 1e-4);
}
/** Gem choices for the jeweller's corrections: stone index → gemstone id. */
export type GemAssignment = Record<number, string>;
export async function buildPieceGlb(parts: SourcePart[], analysis: Analysis & { shells: Shell[] }, options: { metal?: MetalChoice; sourceNames?: string; gems?: GemAssignment; rig?: Rig | null } = {}): Promise<{ glb: Uint8Array; report: BuildReport }> {
  await MeshoptSimplifier.ready;
  const scene = new Scene(), root = new Group(); root.name = 'AMES piece (authored in mm)'; root.scale.setScalar(0.001); scene.add(root);
  // Original object, layer and material names, kept so the server can sort the piece into its category.
  if (options.sourceNames) root.userData.ames_source_names = options.sourceNames.replace(/\s+/g, ' ').slice(0, 2000);
  const gems = new Map<string, MeshStandardMaterial>(), gemOf = (s: Stone) => options.gems?.[analysis.stones.indexOf(s)] || s.gem.id;
  const add = (name: string, geometry: BufferGeometry, material: MeshStandardMaterial, matrix?: Matrix4, extras?: Record<string, unknown>, parent: Group = root) => {
    const mesh = new Mesh(geometry, material); mesh.name = name;
    if (matrix) matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    if (extras) mesh.userData = extras; parent.add(mesh); return mesh;
  };
  // Moving parts (bracelet links, earring drops): one group each in its own frame, nested under its parent part.
  const plan = options.rig || null, linkGroups: Group[] = [], linkInverse: Matrix4[] = [];
  if (plan) {
    Object.assign(root.userData, plan.extras);
    for (const f of plan.nodes) {
      const g = new Group(), m = new Matrix4().makeBasis(new Vector3(...f.x), new Vector3(...f.y), new Vector3(...f.z)).setPosition(...f.o);
      const local = f.parent >= 0 ? linkInverse[f.parent].clone().multiply(m) : m;
      g.name = f.name; g.userData = { ...f.extras }; local.decompose(g.position, g.quaternion, g.scale);
      linkGroups.push(g); linkInverse.push(m.clone().invert()); (f.parent >= 0 ? linkGroups[f.parent] : root).add(g);
    }
    // A bracelet also says how many stones it carries, and of which gem (for the measurement line).
    const bracelet = plan.extras.ames_bracelet as Record<string, unknown> | undefined;
    if (bracelet && analysis.stones.length) {
      const count = new Map<string, number>(); analysis.stones.forEach(s => count.set(gemOf(s), (count.get(gemOf(s)) || 0) + 1));
      const main = [...count].sort((x, y) => y[1] - x[1])[0][0];
      root.userData.ames_bracelet = { ...bracelet, stones: analysis.stones.length, stone: gem(main).name };
    }
  }
  /** Where a piece goes: its link group (and the matrix taking piece coordinates into it), or the piece itself. */
  const place = (link: number) => link >= 0 && plan ? { parent: linkGroups[link], inverse: linkInverse[link] } : { parent: root, inverse: null };
  // Metal and other surfaces, grouped by tone.
  const groups = new Map<string, { shell: number; tris: Uint32Array }[]>(), report: BuildReport = { metalTriangles: 0, heroStones: 0, melee: 0, metal: [], others: 0, ownFacets: 0, textures: 0, ...(plan?.extras.ames_bracelet ? { bracelet: plan.extras.ames_bracelet as BuildReport['bracelet'] } : {}), ...(plan && plan.nodes.some(n => n.extras.ames_dangle) ? { dangles: plan.nodes.filter(n => n.extras.ames_dangle).length } : {}), ...(plan && plan.nodes.some(n => n.extras.ames_open) ? { opens: plan.nodes.filter(n => n.extras.ames_open).length } : {}) };
  // Each shell's triangles by link (all in one piece when the piece is not a split bracelet).
  const pieces = (i: number): [number, Uint32Array][] => {
    const sh = analysis.shells[i]; if (!plan) return [[-1, sh.triangles]];
    if (plan.shellNode[i] >= -1) return [[plan.shellNode[i], sh.triangles]];
    const per = new Map<number, number[]>(), links = plan.triangleNode.get(i)!;
    sh.triangles.forEach((t, j) => { let l = per.get(links[j]); if (!l) per.set(links[j], l = []); l.push(t); });
    return [...per].map(([k, l]) => [k, Uint32Array.from(l)]);
  };
  const push = (key: string, i: number) => { for (const [link, tris] of pieces(i)) { const k = `${key}#${link}`; let list = groups.get(k); if (!list) groups.set(k, list = []); list.push({ shell: i, tris }); } };
  const textured = new Set<number>();
  for (const i of analysis.metalShells) {
    const shellPart = analysis.shells[i].part, part = parts[shellPart];
    // Textured non-metal surfaces (enamel, dials) keep their image, one surface per source part.
    if (part.map && part.uv && !METAL_WORDS_FOR_TEXTURE.test(part.hint) && (textured.has(shellPart) || textured.size < MAX_TEXTURES)) {
      textured.add(shellPart); push(`texture:${shellPart}`, i); continue;
    }
    const finish = FINISHES.find(([re]) => re.test(part.hint))?.[1] || 'Polished';
    const key = OTHER_WORDS.test(part.hint) ? `other:${(part.color || [0.9, 0.9, 0.9]).map(v => v.toFixed(3)).join(',')}` : `metal:${options.metal && options.metal !== 'auto' ? options.metal : metalTone(part.color)}:${finish}`;
    push(key, i);
  }
  const totalMetal = analysis.metalShells.reduce((n, i) => n + analysis.shells[i].triangles.length, 0);
  const materials = new Map<string, { material: MeshStandardMaterial; nodeName: string }>();
  for (const [groupKey, shells] of groups) {
    const [key, linkText] = groupKey.split('#'), { parent, inverse } = place(Number(linkText));
    const count = shells.reduce((n, x) => n + x.tris.length, 0), pos = new Float32Array(count * 9); let o = 0;
    const withUv = key.startsWith('texture:'), uv = withUv ? new Float32Array(count * 6) : null; let u = 0;
    for (const { shell: i, tris } of shells) { const sh = analysis.shells[i], p = parts[sh.part].positions, src = parts[sh.part].uv;
      for (const t of tris) { pos.set(p.subarray(t * 9, t * 9 + 9), o); o += 9; if (uv && src) { uv.set(src.subarray(t * 6, t * 6 + 6), u); u += 6; } } }
    let g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(pos, 3)); if (uv) g.setAttribute('uv', new BufferAttribute(uv, 2));
    g = mergeVertices(toCreasedNormals(g, Math.PI / 6), 1e-4);
    if (totalMetal > METAL_BUDGET && g.index) {
      const target = Math.max(9000, Math.floor(count * METAL_BUDGET / totalMetal) * 3);
      const [index] = MeshoptSimplifier.simplify(new Uint32Array(g.index.array), new Float32Array(g.getAttribute('position').array), 3, target, 0.0004);
      g.setIndex(new BufferAttribute(index, 1));
    }
    if (inverse) g.applyMatrix4(inverse);
    report.metalTriangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    const made = materials.get(key); if (made) { add(made.nodeName, g, made.material, undefined, undefined, parent); continue; }
    const [kind, value, finish] = key.split(':');
    let material: MeshStandardMaterial, nodeName = 'Other surface';
    if (kind === 'metal' && finish === 'Polished') { const m = METALS[value as keyof typeof METALS]; report.metal.push(value); material = new MeshStandardMaterial({ name: m.name, color: linear(m.color), metalness: 1, roughness: 0.05 }); nodeName = 'Metal'; }
    else if (kind === 'metal') {
      // Finished metal: named without the viewer's metal words so it keeps this roughness (the polished studio metal ignores it).
      const m = METALS[value as keyof typeof METALS], tone = value === 'white' ? 'White' : value === 'yellow' ? 'Yellow' : 'Rose', roughness = FINISHES.find(f => f[1] === finish)![2];
      report.metal.push(`${value} (${finish.toLowerCase()})`); nodeName = `${finish} surface`;
      material = new MeshPhysicalMaterial({ name: `${finish} ${tone} finish | visual study`, color: linear(m.color), metalness: 1, roughness, clearcoat: 0 });
    }
    else if (kind === 'texture') {
      const part = parts[Number(value)], map = webTexture(part.map as Texture); report.others++; report.textures++;
      material = new MeshStandardMaterial({ name: 'Textured surface | visual study', map, color: map ? new Color(1, 1, 1) : linear(part.color || [0.9, 0.9, 0.9]), metalness: 0, roughness: 0.35 });
    }
    else { report.others++; material = new MeshStandardMaterial({ name: 'Enamel / other | visual study', color: linear(value.split(',').map(Number)), metalness: 0, roughness: 0.35 }); }
    materials.set(key, { material, nodeName }); add(nodeName, g, material, undefined, undefined, parent);
  }
  // Stones. A studio cut replaces the facets where AMES has one; the viewer re-cuts its own brilliant
  // library from ames_cut, other gems get the studio cut baked in here. Other shapes keep the jeweller's facets.
  const unit = meleeUnit(), studio = new Map<Cut, BufferGeometry>();
  const studioCut = (cut: Cut) => { let g = studio.get(cut); if (!g) { g = createStudioBrilliantGeometry(cut); g.computeBoundingBox(); studio.set(cut, g); } return g; };
  const recut = (s: Stone, id: string) => !!s.cut && !isSurfaceGem(id);
  const layoutMelee = analysis.stones.filter(s => s.melee && recut(s, gemOf(s)));
  for (const [i, s] of analysis.stones.filter(s => !layoutMelee.includes(s)).entries()) {
    const id = gemOf(s), name = `${gem(id).name} ${s.shape} ${i + 1}`, { parent, inverse } = place(plan ? plan.nodeOf(s.center) : -1);
    const at = (m: Matrix4) => inverse ? inverse.clone().multiply(m) : m;
    if (recut(s, id) && ENGINE_RECUT_IDS.has(id)) {
      const g = unit.clone(); g.scale(s.width / 2, s.depth / 1.208, s.length / 2); g.translate(0, 0.282 * s.depth / 1.208, 0);
      add(name, g, gemMaterial(id, gems), at(basis(s).setPosition(...s.center)), gemExtras(id, { ames_cut: s.cut }), parent);
    } else if (recut(s, id)) {
      // Fit the studio cut to the stone's outline and depth, girdle centred where the stone sits.
      const g = studioCut(s.cut!).clone(), b = g.boundingBox!, size = b.getSize(new Vector3()), mid = b.getCenter(new Vector3());
      g.translate(-mid.x, -mid.y, -mid.z); g.scale(s.width / size.x, s.depth / size.y, s.length / size.z);
      add(name, g, gemMaterial(id, gems), at(basis(s).setPosition(...s.center)), gemExtras(id, { ames_shape: s.shape }), parent);
    } else {
      const g = shellGeometry(parts, analysis.shells[s.shell], isSurfaceGem(id) ? Math.PI / 4 : Math.PI / 9); if (inverse) g.applyMatrix4(inverse);
      add(name, g, gemMaterial(id, gems), undefined, gemExtras(id, { ames_shape: s.shape }), parent);
      report.ownFacets++;
    }
    report.heroStones++;
  }
  // Melee: position, rotation and size only (ames_pave_layout), one layout per gemstone; the viewer builds the stones.
  // A split bracelet gets one layout per gemstone per link, in the link's frame.
  const byGem = new Map<string, Stone[]>(); for (const s of layoutMelee) { const key = `${gemOf(s)}#${plan ? plan.nodeOf(s.center) : -1}`; let l = byGem.get(key); if (!l) byGem.set(key, l = []); l.push(s); }
  for (const [key, melee] of byGem) {
    const [id, linkText] = key.split('#'), { parent, inverse } = place(Number(linkText)), turn = inverse ? new Quaternion().setFromRotationMatrix(inverse) : null;
    const local = (p: Vec3): Vec3 => inverse ? new Vector3(...p).applyMatrix4(inverse).toArray() as Vec3 : p;
    // The viewer's melee sits with its girdle on the layout point: 73% of the depth up from the culet.
    const girdle = (s: Stone) => s.center.map((v, a) => v + s.y[a] * 0.2334 * s.depth) as Vec3;
    const layout = new Float32Array(melee.length * 8), q = new Quaternion();
    melee.forEach((s, i) => { q.setFromRotationMatrix(basis(s)); if (turn) q.premultiply(turn); layout.set([...local(girdle(s)), q.x, q.y, q.z, q.w, s.width], i * 8); });
    const first = melee[0], g = unit.clone(); g.scale(first.width / 2, first.width / 2, first.width / 2); g.applyMatrix4(basis(first).setPosition(...girdle(first))); if (inverse) g.applyMatrix4(inverse);
    let bin = ''; const bytes = new Uint8Array(layout.buffer); for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    add(id === 'stone-diamond' ? 'Pavé' : `Pavé ${gem(id).name}`, g, gemMaterial(id, gems), undefined, gemExtras(id, { ames_pave: true, ames_pave_layout: btoa(bin) }), parent);
    report.melee += melee.length;
  }
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true }) as ArrayBuffer;
  report.metalTriangles = Math.round(report.metalTriangles);
  return { glb: new Uint8Array(glb), report };
}
