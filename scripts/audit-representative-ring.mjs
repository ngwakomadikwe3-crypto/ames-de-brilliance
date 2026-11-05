import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const path = 'public/ames-engine/dev-test-candidate-ring/web/jewelry.glb';
const bytes = await readFile(path);
const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
if (json.images?.length || json.buffers.some(b => b.uri)) throw new Error('Audit expects the self-contained untextured ring');
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const parts = [];
const a = new Vector3(), b = new Vector3(), c = new Vector3();
gltf.scene.updateMatrixWorld(true);
gltf.scene.traverse(mesh => {
  if (!mesh.isMesh) return;
  const p = mesh.geometry.attributes.position, n = mesh.geometry.attributes.normal, index = mesh.geometry.index;
  let invalidPositions = 0, invalidNormals = 0, degenerateTriangles = 0;
  for (let i = 0; i < p.count; i++) if (![p.getX(i),p.getY(i),p.getZ(i)].every(Number.isFinite)) invalidPositions++;
  for (let i = 0; i < (n?.count || 0); i++) { const length = Math.hypot(n.getX(i),n.getY(i),n.getZ(i)); if (!Number.isFinite(length) || Math.abs(length - 1) > 0.01) invalidNormals++; }
  const count = index?.count || p.count;
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(p,index ? index.getX(i) : i); b.fromBufferAttribute(p,index ? index.getX(i+1) : i+1); c.fromBufferAttribute(p,index ? index.getX(i+2) : i+2);
    if (b.sub(a).cross(c.sub(a)).lengthSq() < 1e-20) degenerateTriangles++;
  }
  const material = mesh.material;
  parts.push({ name:mesh.name, role:mesh.userData.ames_role, vertices:p.count, triangles:count/3, normals:!!n, invalidPositions, invalidNormals, degenerateTriangles, material:material.name, metalness:material.metalness, roughness:material.roughness });
});
const bounds = new Box3().setFromObject(gltf.scene);
const report = {
  asset:'dev-test-candidate-ring:2', path, sha256:createHash('sha256').update(bytes).digest('hex'), bytes:bytes.length,
  meshes:parts.length, vertices:parts.reduce((n,p)=>n+p.vertices,0), triangles:parts.reduce((n,p)=>n+p.triangles,0),
  boundsInUnverifiedSourceUnits:{min:bounds.min.toArray(),max:bounds.max.toArray(),size:bounds.getSize(new Vector3()).toArray()},
  geometryBufferBytes:json.bufferViews.reduce((n,v)=>n+v.byteLength,0), embeddedImages:json.images?.length || 0,
  extensions:json.extensionsUsed, parts,
  limits:['Structural inspection, not manufacturing validation.','Bounds do not establish millimetres or carat.','Buffer bytes exclude decoded JS, BVH, environment textures, framebuffer and GPU allocation.','Normal lengths do not prove correct winding or watertight topology.'],
};
await mkdir('docs/qa/representative-ring',{recursive:true});
await writeFile('docs/qa/representative-ring/geometry.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,parts:undefined},null,2));
