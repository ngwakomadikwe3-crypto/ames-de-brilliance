import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {BoxGeometry,MeshPhysicalMaterial,Texture} from 'three';
import {measurements} from './measure-gem-light.mjs';
const require=createRequire(import.meta.url),ts=require('typescript'),exports={};
vm.runInNewContext(ts.transpileModule(readFileSync('node_modules/ames-engine/src/engine/materials/PhysicalStudioGem.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require});
const {getGemBudget,createPhysicalStudioGem,setStudioGemQuality}=exports;

test('settled phone optics retain desktop internal-reflection depth',()=>{
  for(const key of ['heroBounces','smallBounces']) assert.equal(getGemBudget(true)[key],getGemBudget(false)[key]);
  assert.ok(getGemBudget(true,true).heroTraces<getGemBudget(true).heroTraces);
});
test('settled hero budget recovers over 96% of 24-bounce reference energy at three angles',()=>{
  for(const m of measurements){
    assert.ok(m.relativeTo24[getGemBudget(true).heroBounces]>.96,`angle ${m.angle}`);
    assert.ok(m.relativeTo24[16]>m.relativeTo24[5]+.08);
  }
});
test('motion and settled transitions update shader uniforms without rebuilding BVHs or coupling viewers',()=>{
  const geometry=new BoxGeometry(1,1,1),source=new MeshPhysicalMaterial(),environment=new Texture();geometry.clearGroups();
  const a=createPhysicalStudioGem(geometry,'stone-diamond',source,environment,environment,1);
  const b=createPhysicalStudioGem(geometry,'stone-diamond',source,environment,environment,1,true);
  const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <envmap_physical_pars_fragment>\n#include <transmission_fragment>'};
  a.onBeforeCompile(shader);const bvh=shader.uniforms.amesBvh.value,cacheKey=a.customProgramCacheKey();
  setStudioGemQuality(a,true,true);
  assert.equal(shader.uniforms.amesBounces.value,8);assert.equal(shader.uniforms.amesTraces.value,1);
  assert.equal(b.userData.bounces,12);
  setStudioGemQuality(a,true,false);
  assert.equal(shader.uniforms.amesBounces.value,16);assert.equal(shader.uniforms.amesTraces.value,3);
  assert.equal(shader.uniforms.amesBvh.value,bvh);assert.equal(a.customProgramCacheKey(),cacheKey);
  a.dispose();b.dispose();geometry.dispose();source.dispose();environment.dispose();
});
test('coloured gemstone surfaces stay colourless and polished; colour remains inside the volume',()=>{
  const geometry=new BoxGeometry(1,1,1),source=new MeshPhysicalMaterial(),environment=new Texture();geometry.clearGroups();
  for(const id of ['stone-amethyst','stone-emerald','stone-ruby','stone-sapphire']){
    const material=createPhysicalStudioGem(geometry,id,source,environment,environment,1);
    assert.equal(material.color.getHexString(),'ffffff');assert.equal(material.metalness,0);
    assert.equal(material.transmission,1);assert.equal(material.clearcoat,0);
    assert.ok(material.roughness<=.015);assert.notEqual(material.attenuationColor.getHexString(),'ffffff');
    assert.ok(material.attenuationDistance>0);material.dispose();
  }
  geometry.dispose();source.dispose();environment.dispose();
});
