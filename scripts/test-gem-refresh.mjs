import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import sharp from 'sharp';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {Color,CubeTexture,Matrix4,Vector4} from 'three';
import {inspectGlb} from '../src/lib/ames-glb-audit.ts';

const require=createRequire(import.meta.url);
function materialModule(name){
 const exports={};
 const source=readFileSync(`node_modules/ames-engine/src/engine/materials/${name}.tsx`,'utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
  {exports,require:name=>name==='react'?{useMemo:f=>f(),useEffect:()=>{}}:name==='@react-three/fiber'?{useThree:f=>f({invalidate(){}})}:require(name)});
 return exports;
}
test('the packaged gem studio uses linearly filtered fixed-range RGBA8 without floating textures',async()=>{
 const root='public/ames-engine/environments/gemstone-softbox-v2/';
 const info=JSON.parse(readFileSync(root+'source.json'));
 assert.equal(info.floatingPointTextures,false);
 assert.equal(info.clippedChannels,0);
 assert.ok(info.peakRadiance<info.range);
 assert.equal(info.faces.length,6);
 let low=Infinity,high=0;
 for(const face of info.faces){
  const {data,info:meta}=await sharp(root+face+'-radiance.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(meta.width,256);assert.equal(meta.height,256);
  for(let i=0;i<data.length;i+=4){
   assert.equal(data[i+3],255,'Fixed-range alpha must never introduce RGBM interpolation artifacts.');
   const srgb=data[i]/255,linear=(srgb<=.04045?srgb/12.92:((srgb+.055)/1.055)**2.4)*info.range;
   low=Math.min(low,linear);high=Math.max(high,linear);
  }
 }
 assert.ok(high/low>10,'Studio must retain meaningful light/dark contrast.');
});
test('facet matrices refresh on every draw and mobile tracing remains bounded',()=>{
 const envMap=new CubeTexture();envMap.userData.rgbmRange=8;
 const {GemstoneFacetMaterial}=materialModule('GemstoneFacetMaterial');
 const node=GemstoneFacetMaterial({envMap,color:new Color('#a879cd'),ior:1.54,volume:{planes:[new Vector4(0,1,0,1)],diameter:2},bounces:4});
 const material=node.props.object;
 const matrixWorld=new Matrix4().makeRotationY(.7);matrixWorld.setPosition(1,2,3);
 material.onBeforeRender(null,null,null,null,{matrixWorld});
 assert.deepEqual(material.uniforms.localToWorld.value.elements,matrixWorld.elements);
 assert.deepEqual(material.uniforms.worldToLocal.value.elements,matrixWorld.clone().invert().elements);
 assert.equal(material.uniformsNeedUpdate,true,'Dynamic crystal transforms must reach GPU uniforms.');
 assert.equal(material.uniforms.traceBounces.value,4);
 assert.equal(material.defines.BOUNCE_COUNT,6);
 assert.ok(material.uniforms.bodyFill.value<.04,'Body fill must not wash out the volume.');
});
test('moonstone keeps its original mesh and supplies a closed higher dome with smooth normals',async()=>{
 const before=inspectGlb(readFileSync('public/ames-engine/stone-moonstone/web/jewelry.glb'));
 const bytes=readFileSync('public/ames-engine/stone-moonstone/web/jewelry-v3.glb');
 const after=inspectGlb(bytes);
 assert.deepEqual(after.errors,[]);
 assert.equal(after.components.length,1);
 assert.equal(after.components[0].closed,true);
 assert.equal(after.components[0].outward,true);
 assert.equal(after.components[0].faceted,false);
 assert.ok(after.dimensionsMm[1]>before.dimensionsMm[1]*1.4);
 for(const i of [0,2])assert.ok(Math.abs(after.dimensionsMm[i]-before.dimensionsMm[i])<.01);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 let mesh;gltf.scene.traverse(o=>{if(o.isMesh)mesh=o;});
 assert.equal(mesh.userData.ames_shape_revision,3);
 const {MoonstoneMaterial}=materialModule('MoonstoneMaterial');
 const envMap=new CubeTexture();envMap.userData.rgbmRange=8;
 const node=MoonstoneMaterial({envMap,geometry:mesh.geometry,baseFraction:mesh.userData.ames_cabochon_base_fraction});
 assert.ok(node.props.object.uniforms.baseLimit.value<0);
 assert.equal(node.props.object.isShaderMaterial,true);
 const contract=JSON.parse(readFileSync('public/ames-engine/stone-moonstone/app/chat.json'));
 assert.equal(contract.stageAsset,'web/jewelry-v3.glb');
 assert.equal(contract.publicationStatus,'review');
});
