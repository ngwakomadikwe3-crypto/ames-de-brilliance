import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { queueJob, sha256, readJob, jobDir, atomicJson, validateSource, requestSchema, listJobs } from './cad/store.mjs';

const repo=process.cwd();
await mkdir(join(repo,'.ames-cad','tests'),{recursive:true});
const isolated=await mkdtemp(join(repo,'.ames-cad','tests','queue-'));
process.chdir(isolated);
const bytes=Buffer.from('o ring\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
const source={fileId:'private-source',kind:'source',filename:'ring.obj',bytes:bytes.length,sha256:sha256(bytes)};
const product={id:'test-product',asset_id:'test-asset',name:'Test ring',category:'ring',workflow_status:'submitted',source_hashes:[source.sha256]};
const input={sourceFileId:source.fileId,units:'mm',assignments:{}};

test('conversion validates formats, size and embedded GLB resources',()=>{
  assert.equal(validateSource('mesh.OBJ',bytes),'obj');
  assert.throws(()=>validateSource('design.3dm',bytes),/Export native/);
  assert.throws(()=>validateSource('design.zip',bytes),/Export native/);
  assert.throws(()=>validateSource('mesh.stl',Buffer.alloc(0)),/100 MB/);
  assert.throws(()=>validateSource('bad.glb',bytes),/Invalid GLB/);
  const json=Buffer.from(JSON.stringify({asset:{version:'2.0'},buffers:[{uri:'file:///private.bin'}]}).padEnd(128,' '));
  const glb=Buffer.alloc(20+json.length);glb.writeUInt32LE(0x46546c67,0);glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);glb.writeUInt32LE(json.length,12);glb.writeUInt32LE(0x4e4f534a,16);json.copy(glb,20);
  assert.throws(()=>validateSource('external.glb',glb),/embed/);
  assert.equal(requestSchema.safeParse({...input,assignments:{'part-0':'invented'}}).success,false);
  assert.throws(()=>jobDir('../escape'),/Invalid/);
});

test('source binding, review locks, duplicate jobs and material revision identity',async()=>{
  await assert.rejects(queueJob(product,source,Buffer.from('changed'),input),/checksum/);
  await assert.rejects(queueJob({...product,workflow_status:'approved'},source,bytes,input),/revision/);
  await assert.rejects(queueJob(product,source,bytes,{...input,assignments:{'part-0':'diamond'}}),/Inspect/);
  const first=await queueJob(product,source,bytes,input);
  assert.equal(first.status,'queued');assert.equal(first.assetId,product.asset_id);
  await assert.rejects(queueJob(product,source,bytes,input),/pending conversion/);
  await atomicJson(join(jobDir(first.id),'job.json'),{...first,status:'ready',result:{components:[{id:'part-0'}]}});
  await assert.rejects(queueJob({...product,id:'other-product'},source,bytes,{...input,baseJobId:first.id}),/does not match/);
  await assert.rejects(queueJob(product,source,bytes,{...input,baseJobId:first.id,materialsConfirmed:true,assignments:{'part-99':'silver'}}),/Unknown/);
  await assert.rejects(queueJob(product,source,bytes,{...input,baseJobId:first.id,assignments:{'part-0':'silver'}}),/Confirm material/);
  const revised=await queueJob(product,source,bytes,{...input,baseJobId:first.id,materialsConfirmed:true,assignments:{'part-0':'platinum'}});
  assert.equal(revised.assignments['part-0'],'platinum');
  assert.equal((await readJob(first.id)).status,'ready');
  assert.equal((await listJobs(product.id)).length,2);
  assert.equal(product.workflow_status,'submitted');
  assert.equal(product.publication_status,undefined);
});
