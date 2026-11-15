// Give a cabochon GLB its real surface: planar UVs over the dome plus the
// textures from cab_textures.py. The node, its extras (which the 3D engine
// reads) and the material identity stay; the coarse stand-ins for patterns
// (inclusion blobs, opal shards, a separate matrix shell) are removed because
// the texture now carries them.
// usage: node cabs-glb.mjs in.glb out.glb <stone-id> <tex-dir>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsTransmission } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';
const [src, dst, id, texDir] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(`${texDir}/spec.json`))[id];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src), root = doc.getRoot();
for (const ext of root.listExtensionsUsed()) if (ext.extensionName === 'EXT_meshopt_compression') ext.dispose();

const gemNode = root.listNodes().find(n => n.getExtras()?.ames_gemstone_id === id) ?? root.listNodes()[0];
let removed = 0;
// Old inclusion blobs: every other mesh node in the file.
for (const n of root.listNodes()) if (n !== gemNode && n.getMesh()) { n.dispose(); removed++; }
const mesh = gemNode.getMesh(), prims = mesh.listPrimitives(), body = prims[0];
// Extra primitives fill cut-outs in the body (opal shards, turquoise matrix),
// so they stay: removing them leaves holes. Opal's shards take the body's
// textured surface so the play-of-colour runs continuously across the stone;
// turquoise keeps its matrix shell as real recessed veins.
const extras = prims.slice(1);

// Planar UVs over the dome: drop the shortest (height) axis, map the other two to 0..1.
const pos = body.getAttribute('POSITION'), el = [], n = pos.getCount();
const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
for (let i = 0; i < n; i++) { pos.getElement(i, el); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], el[k]); hi[k] = Math.max(hi[k], el[k]); } }
const size = hi.map((h, k) => h - lo[k]), up = size.indexOf(Math.min(...size)), [a, b] = [0, 1, 2].filter(k => k !== up);
const span = Math.max(size[a], size[b]), uv = new Float32Array(n * 2);
for (let i = 0; i < n; i++) { pos.getElement(i, el); uv[i * 2] = (el[a] - lo[a]) / span; uv[i * 2 + 1] = (el[b] - lo[b]) / span; }
const uvFor = (prim) => {
  const ps = prim.getAttribute('POSITION'), out = new Float32Array(ps.getCount() * 2);
  for (let i = 0; i < ps.getCount(); i++) { ps.getElement(i, el); out[i * 2] = (el[a] - lo[a]) / span; out[i * 2 + 1] = (el[b] - lo[b]) / span; }
  return doc.createAccessor().setType('VEC2').setArray(out).setBuffer(root.listBuffers()[0]);
};
body.setAttribute('TEXCOORD_0', uvFor(body));
if (id === 'stone-opal') for (const p of extras) { p.setAttribute('TEXCOORD_0', uvFor(p)); p.setMaterial(body.getMaterial()); }

const tex = (file) => doc.createTexture(file).setImage(fs.readFileSync(`${texDir}/${id}/${file}`)).setMimeType(file.endsWith('.png') ? 'image/png' : 'image/jpeg');
const mat = body.getMaterial();
mat.setBaseColorTexture(tex(spec.base)).setBaseColorFactor([1, 1, 1, 1]);
if (spec.emissive) mat.setEmissiveTexture(tex(spec.emissive)).setEmissiveFactor([1, 1, 1]);
if (spec.mr) mat.setMetallicRoughnessTexture(tex(spec.mr)).setMetallicFactor(1).setRoughnessFactor(1);
if (spec.roughness) mat.setRoughnessFactor(spec.roughness);
if (spec.transmission !== undefined) {
  const t = mat.getExtension('KHR_materials_transmission') ?? doc.createExtension(KHRMaterialsTransmission).createTransmission();
  t.setTransmissionFactor(spec.transmission); mat.setExtension('KHR_materials_transmission', t);
}
for (const m of root.listMaterials()) if (!m.listParents().some(p => p !== root)) m.dispose();
for (const acc of root.listAccessors()) if (!acc.listParents().some(p => p !== root)) acc.dispose();
await io.write(dst, doc);
console.log(`${id}: textured (${Object.keys(spec).join(', ')}), removed ${removed} stand-in parts, ${(fs.statSync(dst).size / 1024) | 0} KB`);
