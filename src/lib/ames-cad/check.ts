// Server: check a converted AMES web model before automatic publication, and sort it into its category.
import { NodeIO, type Node } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization, KHRMaterialsTransmission, KHRMaterialsIOR, KHRMaterialsVolume, KHRMaterialsClearcoat, KHRMaterialsSpecular, KHRTextureTransform } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { splitShells, samplePoints, type SourcePart } from './geometry';
import { classify, type Classification } from './classify';

const CUTS = new Set(['round', 'oval', 'pear', 'cushion', 'radiant']);
const ALLOWED_EXTENSIONS = new Set(['EXT_meshopt_compression', 'KHR_mesh_quantization', 'KHR_materials_transmission', 'KHR_materials_ior', 'KHR_materials_volume', 'KHR_materials_clearcoat', 'KHR_materials_specular', 'KHR_texture_transform']);
export const LIMITS = { bytes: 60 * 1024 * 1024, triangles: 1_500_000, nodes: 6000, stones: 400, melee: 6000, textures: 4, textureBytes: 4 * 1024 * 1024 };

export type PieceCheck = { ok: true; triangles: number; stones: number; melee: number; size: [number, number, number]; classification: Classification };

function worldPoint(m: number[], v: number[]) { return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]]; }

export async function checkPieceGlb(bytes: Uint8Array, names: string): Promise<PieceCheck> {
  const fail = (message: string): never => { throw new Error(`3D model check: ${message}`); };
  if (bytes.length > LIMITS.bytes) fail('the converted model is over 60 MB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) fail('not a GLB 2 file.');
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))));
  for (const name of json.extensionsUsed || []) if (!ALLOWED_EXTENSIONS.has(name)) fail(`unsupported extension ${name}.`);
  for (const item of [...(json.buffers || []), ...(json.images || [])]) if (item.uri) fail('external files are not allowed.');
  if ((json.images || []).length > LIMITS.textures) fail('too many textures.');
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, KHRMaterialsTransmission, KHRMaterialsIOR, KHRMaterialsVolume, KHRMaterialsClearcoat, KHRMaterialsSpecular, KHRTextureTransform]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.readBinary(bytes), rootDoc = doc.getRoot();
  if (rootDoc.listNodes().length > LIMITS.nodes) fail('too many parts.');
  for (const t of rootDoc.listTextures()) if ((t.getImage()?.byteLength || 0) > LIMITS.textureBytes) fail('a texture is over 4 MB.');
  const sourceNames = rootDoc.listNodes().map(n => String((n.getExtras() as { ames_source_names?: unknown }).ames_source_names || '')).join(' ').slice(0, 4000);
  const parts: SourcePart[] = [], stones: { width: number }[] = []; let triangles = 0, melee = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const grow = (p: number[]) => { for (let a = 0; a < 3; a++) { if (!Number.isFinite(p[a])) fail('invalid coordinates.'); min[a] = Math.min(min[a], p[a]); max[a] = Math.max(max[a], p[a]); } };
  for (const node of rootDoc.listNodes() as Node[]) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const extras = node.getExtras() as Record<string, unknown>, m = node.getWorldMatrix() as unknown as number[], mm = m.map(v => v * 1000);
    const gem = extras.ames_optical_mode === 'closed-dielectric-visual';
    if (extras.ames_cut != null && !CUTS.has(String(extras.ames_cut))) fail('unknown stone cut.');
    if (typeof extras.ames_pave_layout === 'string') {
      const raw = Buffer.from(extras.ames_pave_layout, 'base64'); if (raw.length % 32 || raw.length / 32 > LIMITS.melee) fail('invalid pavé layout.');
      const f = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
      const parent = (node.getParentNode()?.getWorldMatrix() as unknown as number[] | undefined) || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      for (let i = 0; i < f.length; i += 8) { const d = f[i + 7] * parent[0] * 1000; if (!(d > 0.2 && d < 6) || [0, 1, 2, 3, 4, 5, 6].some(k => !Number.isFinite(f[i + k]))) fail('invalid melee in the pavé layout.'); grow(worldPoint(parent, [f[i], f[i + 1], f[i + 2]]).map(v => v * 1000)); stones.push({ width: d }); melee++; }
      continue;
    }
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'); if (!pos) continue;
      const idx = prim.getIndices(), count = idx ? idx.getCount() : pos.getCount(); triangles += count / 3;
      if (triangles > LIMITS.triangles) fail('more than 1.5 million triangles.');
      if (gem) { // getMin/getMax are raw quantised values: measure through getElement (denormalised)
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], v: number[] = [0, 0, 0];
        for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]); } }
        grow(worldPoint(mm, lo)); grow(worldPoint(mm, hi)); const sx = Math.hypot(mm[0], mm[1], mm[2]); stones.push({ width: Math.min(hi[0] - lo[0], hi[2] - lo[2]) * sx }); continue; }
      const out = new Float32Array(count * 3), v: number[] = [0, 0, 0];
      for (let i = 0; i < count; i++) { pos.getElement(idx ? idx.getScalar(i) : i, v); const w = worldPoint(mm, v); out.set(w, i * 3); if (i % 97 === 0) grow(w); }
      const mat = prim.getMaterial();
      parts.push({ name: node.getName(), hint: `${node.getName()} ${mesh.getName()} ${mat?.getName() || ''}`, color: null, positions: out });
    }
  }
  if (stones.length - melee > LIMITS.stones) fail('too many large stones.');
  const size = [0, 1, 2].map(a => max[a] - min[a]) as [number, number, number];
  if (!parts.length || Math.max(...size) < 2 || Math.max(...size) > 450) fail(`the piece must be between 2 mm and 450 mm (found ${size.map(v => v.toFixed(1)).join(' x ')} mm, ${parts.length} metal parts).`);
  const shells = splitShells(parts);
  const metalParts = shells.map(s => [0, 1, 2].map(k => s.max[k] - s.min[k]).sort((x, y) => y - x));
  const points = samplePoints(parts, shells, shells.map((_, i) => i));
  const classification = classify({ points, metalParts, stones, names: `${names} ${sourceNames} ${rootDoc.listNodes().map(n => n.getName()).join(' ')} ${rootDoc.listMaterials().map(m => m.getName()).join(' ')}` });
  return { ok: true, triangles: Math.round(triangles), stones: stones.length - melee, melee, size, classification };
}

/** Compress a checked model for the web (meshopt, lossless filters): what the Boutique downloads. */
export async function compressPieceGlb(bytes: Uint8Array): Promise<Uint8Array> {
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, KHRMaterialsTransmission, KHRMaterialsIOR, KHRMaterialsVolume, KHRMaterialsClearcoat, KHRMaterialsSpecular, KHRTextureTransform])
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.readBinary(bytes);
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  return io.writeBinary(doc);
}
