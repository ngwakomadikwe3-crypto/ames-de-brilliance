import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript'),three=require('three');
const engine=resolve('node_modules/ames-engine/src/engine'),cache=new Map();
function load(path){
 if(cache.has(path))return cache.get(path);
 const exports={};cache.set(path,exports);
 vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {exports,console,require:name=>name.startsWith('.')?load(resolve(dirname(path),name+'.ts')):require(name)});
 return exports;
}
const {createStudioBrilliantGeometry}=load(engine+'/jewelry/createStudioBrilliantGeometry.ts');
const {analyzeRoundBrilliantTopology}=load(engine+'/jewelry/createRoundBrilliantGeometry.ts');
const {createPhysicalStudioGem}=load(engine+'/materials/PhysicalStudioGem.ts');
test('refined brilliant is closed, outward wound and has hundreds of flat facets',()=>{
 const g=createStudioBrilliantGeometry(),report=analyzeRoundBrilliantTopology(g);
 assert.equal(report.watertight,true);assert.equal(report.duplicateTriangleCount,0);assert.equal(report.inconsistentlyWoundEdgeCount,0);
 assert.ok(g.userData.flatFacets>=200,JSON.stringify(g.userData));assert.ok(report.triangleCount>=300);
 const normals=g.getAttribute('normal');
 for(let i=0;i<normals.count;i+=3)for(let j=1;j<3;j++)assert.ok(new three.Vector3().fromBufferAttribute(normals,i).distanceTo(new three.Vector3().fromBufferAttribute(normals,i+j))<1e-6);
 assert.ok(g.boundingBox.min.y<0&&g.boundingBox.max.y>0);g.dispose();
});
test('pear, cushion and radiant outlines remain distinct closed cuts',()=>{
 for(const outline of ['round','oval','pear','cushion','radiant']){
  const g=createStudioBrilliantGeometry(outline),report=analyzeRoundBrilliantTopology(g);
  assert.equal(report.watertight,true,outline);assert.equal(report.inconsistentlyWoundEdgeCount,0,outline);assert.equal(g.userData.outline,outline);
  if(outline==='pear')assert.notEqual(g.boundingBox.max.x,g.boundingBox.max.z);
  g.dispose();
 }
});
test('stone IOR, volume absorption, depth and dispersion survive every material creation',()=>{
 for(const [id,ior] of [['stone-diamond',2.417],['stone-ruby',1.76],['stone-sapphire',1.76],['stone-emerald',1.57],['stone-morganite',1.58]]){
  const g=createStudioBrilliantGeometry(),source=new three.MeshPhysicalMaterial({color:'#ff00ff'}),env=new three.Texture(),raw=new three.Texture();
  const m=createPhysicalStudioGem(g,id,source,env,raw,2);
  assert.equal(m.type,'MeshPhysicalMaterial');assert.equal(m.ior,ior);assert.equal(m.transmission,1);assert.equal(m.roughness,0);assert.equal(m.color.getHexString(),'ffffff');
  assert.equal(m.thickness,g.boundingBox.max.y-g.boundingBox.min.y);assert.ok(m.attenuationDistance>m.thickness);assert.ok(m.dispersion>0);assert.equal(m.envMap,env);
  assert.equal(source.color.getHexString(),'ff00ff');m.dispose();g.dispose();source.dispose();env.dispose();raw.dispose();
 }
});
