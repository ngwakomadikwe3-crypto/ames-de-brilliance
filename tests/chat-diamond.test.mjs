import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DoubleSide,Raycaster,Vector3} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {canonicalFacetPlanes} from '../src/three/AMESDiamondMaterial.ts';
const hash=array=>createHash('sha256').update(Buffer.from(array.buffer,array.byteOffset,array.byteLength)).digest('hex');
for(const cut of ['round_brilliant','oval_brilliant','emerald_cut','pear_brilliant','asscher_cut']) test(`${cut}: facet-plane intersections agree with canonical triangles without mutation`,async()=>{
 const bytes=fs.readFileSync(`public/models/canonical/ames_${cut}_v1.glb`);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 let mesh;gltf.scene.traverse(o=>{if(o.isMesh)mesh=o;});mesh.updateMatrixWorld(true);mesh.material.side=DoubleSide;
 const positions=mesh.geometry.getAttribute('position').array,index=mesh.geometry.index.array;
 const before=[hash(positions),hash(index)];
 const {planes,opticalCount,interiorRadius}=canonicalFacetPlanes(mesh);assert.ok(planes.length>=4 && planes.length<=224);
 const origin=new Vector3(0,-0.08,0);
 for(let i=0;i<100;i++){
  const y=1-2*(i+.5)/100,a=i*2.3999632297;
  const direction=new Vector3(Math.sqrt(1-y*y)*Math.cos(a),y,Math.sqrt(1-y*y)*Math.sin(a));
  let distance=Infinity;
  for(const p of planes){const n=new Vector3(p.x,p.y,p.z),denom=n.dot(direction);if(denom>1e-6)distance=Math.min(distance,(p.w-n.dot(origin))/denom);}
  let accelerated=Infinity;
  function intersect(p){const n=new Vector3(p.x,p.y,p.z),denom=n.dot(direction);if(denom>1e-6)accelerated=Math.min(accelerated,(p.w-n.dot(origin))/denom);}
  planes.slice(0,opticalCount).forEach(intersect);
  const provisional=origin.clone().addScaledVector(direction,accelerated);
  if(Math.max(origin.x**2+origin.z**2,provisional.x**2+provisional.z**2)>=(interiorRadius*.99999)**2)planes.slice(opticalCount).forEach(intersect);
  assert.ok(Math.abs(accelerated-distance)<1e-8,`girdle shortcut changed ray ${i}`);
  const hit=new Raycaster(origin,direction).intersectObject(mesh)[0];assert.ok(hit);
  assert.ok(Math.abs(distance-hit.distance)<0.00001,`ray ${i}: ${distance} / ${hit.distance}`);
 }
 assert.deepEqual([hash(positions),hash(index)],before);
 mesh.geometry.dispose();mesh.material.dispose();
});
