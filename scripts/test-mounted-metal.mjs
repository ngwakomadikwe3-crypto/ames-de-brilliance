import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CubeTexture,MeshStandardMaterial} from 'three';
const require=createRequire(import.meta.url);
function load(path,extra={}){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>extra[name]??require(name)});return exports;}
const profiles=load('node_modules/ames-engine/src/engine/renderer/opticsProfiles.ts');
const materials=load('node_modules/ames-engine/src/engine/jewelry/jewelryGlbMaterials.ts',{'../renderer/opticsProfiles':profiles});
test('mounted jewelry has bare metal reflections without changing existing material profiles',()=>{
 const source=new MeshStandardMaterial({color:0xbec8dc,metalness:1});const env=new CubeTexture();
 const ring=materials.createMetalMaterial(source,env,'mounted-gem-studio');
 assert.equal(ring.metalness,1);assert.equal(ring.clearcoat,0);assert.equal(ring.transmission,0);assert.ok(ring.roughness<.1);assert.equal(ring.envMap,env);assert.ok(ring.color.equals(source.color));
 assert.equal(materials.createMetalMaterial(source,env,'gemstone-studio').clearcoat,.5);
 assert.equal(materials.createMetalMaterial(source,env,'soft-studio').roughness,.13);
});
test('the actual solitaire separates all 21 closed gems from its metal surfaces',async()=>{
 const b=readFileSync('public/ames-engine/demo-pave-solitaire/web/solitaire-v1.glb');const g=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 const result=materials.applyJewelryMaterials(g.scene,new CubeTexture(),{opticsProfile:'mounted-gem-studio'});
 assert.equal(result.gemSurfaces,21);assert.ok(result.metalSurfaces>40);assert.equal(result.otherSurfaces,0);
 g.scene.traverse(o=>{if(o.isMesh&&!materials.isQualifiedDielectricMesh(o)){assert.equal(o.material.clearcoat,0);assert.equal(o.material.metalness,1);}});
});
