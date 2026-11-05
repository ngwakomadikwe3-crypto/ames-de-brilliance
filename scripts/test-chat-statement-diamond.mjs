import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {inspectGlb} from '../src/lib/ames-glb-audit.ts';
import {loadChatStageContent} from '../src/lib/ames-chat-content.ts';
import {parseAssetSelection,validatedAssetSelection,DEFAULT_CHAT_ASSET_ID} from '../src/lib/chat-asset-selection.ts';

const require=createRequire(import.meta.url);
const root='public/ames-engine/demo-modern-diamond/';
const bytes=readFileSync(root+'web/diamond-v1.glb');
const readJson=path=>JSON.parse(readFileSync(path,'utf8'));
const fixtures=async url=>Response.json(readJson('public'+url));
function engineModule(path,dependencies={}){
  const exports={};
  vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:name=>name in dependencies?dependencies[name]:require(name)});
  return exports;
}
test('default, ring restoration and educational diamond stay distinct and exact-ID validated',async()=>{
  assert.equal(DEFAULT_CHAT_ASSET_ID,'demo-reference-ring');
  const content=await loadChatStageContent('demo-modern-diamond',fixtures);
  assert.equal(content.contract.assetId,'demo-modern-diamond');
  assert.equal(content.commerciallyApproved,false);
  assert.equal(content.contract.essentialSpecs.manufacturingReady,false);
  assert.equal(parseAssetSelection('Show the default diamond','stone-ruby').assetId,'demo-modern-diamond');
  assert.equal(parseAssetSelection('Show the ring again',DEFAULT_CHAT_ASSET_ID).assetId,'demo-reference-ring');
  assert.equal(parseAssetSelection('Show me a loose diamond',DEFAULT_CHAT_ASSET_ID).assetId,'stone-diamond');
  assert.equal(validatedAssetSelection(DEFAULT_CHAT_ASSET_ID).assetId,DEFAULT_CHAT_ASSET_ID);
  assert.equal(validatedAssetSelection('../demo-modern-diamond'),null);
  for(const index of ['boutique','media'])assert.ok(!JSON.stringify(readJson(`public/ames-engine/${index}/index.json`)).includes(DEFAULT_CHAT_ASSET_ID));
});
test('the actual model is closed, faceted, within mobile budgets and at authored metre scale',()=>{
  const model=inspectGlb(bytes);
  assert.deepEqual(model.errors,[]);
  assert.equal(model.components.length,1);
  assert.equal(model.components[0].closed,true);
  assert.equal(model.components[0].outward,true);
  assert.equal(model.components[0].shells,1);
  assert.equal(model.components[0].faceted,true);
  assert.ok(model.bytes<100_000);
  assert.ok(model.triangles<1000);
  model.dimensionsMm.forEach((v,i)=>assert.ok(Math.abs(v-[12,8.94,18][i])<.01));
  const provenance=readJson('source-assets/chat-statement-diamond/revision-1/provenance.json');
  assert.equal(provenance.modelSha256,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(provenance.physicalStoneMeasured,false);
});
test('real GLTF loader and vendored engine accept the model for convex internal refraction',async()=>{
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const meshes=[];gltf.scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
  const optics=engineModule('node_modules/ames-engine/src/engine/renderer/opticsProfiles.ts');
  const materials=engineModule('node_modules/ames-engine/src/engine/jewelry/jewelryGlbMaterials.ts',{'../renderer/opticsProfiles':optics});
  const convex=engineModule('node_modules/ames-engine/src/engine/materials/convexGemVolume.ts');
  assert.equal(meshes.length,1);
  assert.equal(materials.isQualifiedDielectricMesh(meshes[0]),true);
  assert.equal(materials.isPureGemMesh(meshes[0]),true);
  const volume=convex.convexGemVolume(meshes[0].geometry);
  assert.ok(volume,'The demo must use the validated facet tracer, not a surface fallback.');
  assert.ok(volume.planes.length<=144);
  assert.ok(volume.planes.length>40);
});
