import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { queueJob, readJob, sha256, jobDir } from './cad/store.mjs';
const repo=process.cwd();
const bytes=await readFile('public/ames-engine/dev-test-earring-001/web/jewelry.glb');
await mkdir('.ames-cad/tests',{recursive:true});
const testRoot=await mkdtemp(resolve('.ames-cad/tests/blender-'));process.chdir(testRoot);
const source={fileId:'test-source',kind:'source',filename:'earring.glb',bytes:bytes.length,sha256:sha256(bytes)};
const product={id:'local-conversion-test',asset_id:'test-earring',name:'Test earring',category:'earrings',workflow_status:'submitted',source_hashes:[source.sha256]};
async function run(){await new Promise((res,rej)=>{const child=spawn(process.execPath,[join(repo,'scripts/cad/worker.mjs'),'--once'],{cwd:testRoot,windowsHide:true,stdio:'inherit'});child.on('error',rej);child.on('exit',code=>code?rej(new Error('Worker failed')):res())})}
let job=await queueJob(product,source,bytes,{sourceFileId:source.fileId,units:'unknown',assignments:{}});
await run();job=await readJob(job.id);assert.equal(job.status,'ready',job.error);assert.ok(job.result.components.length);
const assignments=Object.fromEntries(job.result.components.map(part=>[part.id,'platinum']));
let revised=await queueJob(product,source,bytes,{sourceFileId:source.fileId,units:'unknown',baseJobId:job.id,materialsConfirmed:true,assignments});
await run();revised=await readJob(revised.id);assert.equal(revised.status,'ready',revised.error);assert.ok(revised.result.components.every(part=>part.material==='platinum'));
assert.equal(revised.sourceSha256,job.sourceSha256);assert.notEqual(revised.result.previewSha256,job.result.previewSha256);
console.log(JSON.stringify({result:'PASS',components:job.result.components.length,triangles:job.result.triangleCount,original:jobDir(job.id),materialPreview:jobDir(revised.id)}));
