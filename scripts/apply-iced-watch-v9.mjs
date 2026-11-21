// Install the Blender rework of the iced watch (scripts/blender/create_iced_watch_v9.py) into a copy of watch-v8:
// only the named meshes are replaced; every node, transform, extra, material and texture stays as it was.
//   node scripts/apply-iced-watch-v9.mjs <watch-v9.json> [in=watch-v8.glb] [out=watch-v9.glb]
// Then compress: npx gltf-transform meshopt <out> <out> --level medium
import { readFile } from 'node:fs/promises';
import { NodeIO, Accessor } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const folder = 'public/ames-engine/ames-iced-watch/web';
const [patchPath, input = folder + '/watch-v8.glb', output = folder + '/watch-v9.glb'] = process.argv.slice(2);
const patch = JSON.parse(await readFile(patchPath, 'utf8'));
const doc = await io.read(input);
const root = doc.getRoot(), buffer = root.listBuffers()[0];
const floats = b64 => { const b = Buffer.from(b64, 'base64'); return new Float32Array(b.buffer, b.byteOffset, b.length / 4).slice(); };
const done = new Set();
for (const [name, mesh] of Object.entries(patch)) {
  const node = root.listNodes().find(n => n.getName() === name);
  if (!node?.getMesh()) throw Error('No mesh node ' + name);
  const target = node.getMesh();
  if (done.has(target)) continue; done.add(target);
  const old = target.listPrimitives()[0];
  const prim = doc.createPrimitive().setMaterial(old.getMaterial())
    .setAttribute('POSITION', doc.createAccessor().setType(Accessor.Type.VEC3).setArray(floats(mesh.positions)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType(Accessor.Type.VEC3).setArray(floats(mesh.normals)).setBuffer(buffer));
  for (const p of target.listPrimitives()) { target.removePrimitive(p); p.dispose(); }
  target.addPrimitive(prim);
  console.log('replaced', name, mesh.count / 3, 'triangles');
}
await io.write(output, doc);
