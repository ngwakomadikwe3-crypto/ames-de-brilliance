import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { queueJob, readJob, sha256 } from './cad/store.mjs';
const repo=process.cwd();
process.env.AMES_CAD_RENDER_SIZE='128';
await mkdir('.ames-cad/tests',{recursive:true});
const testRoot=await mkdtemp(resolve('.ames-cad/tests/formats-'));
const fixture=join(testRoot,'fixture.py');
await writeFile(fixture,`import bpy, sys\nfrom pathlib import Path\np=Path(sys.argv[sys.argv.index('--')+1])\nbpy.ops.object.select_all(action='SELECT')\nbpy.ops.object.delete(use_global=False)\nbpy.ops.mesh.primitive_cube_add()\nbpy.context.object.name='Fixture component'\nbpy.ops.wm.obj_export(filepath=str(p/'fixture.obj'),export_materials=False)\nbpy.ops.wm.stl_export(filepath=str(p/'fixture.stl'))\nbpy.ops.export_scene.fbx(filepath=str(p/'fixture.fbx'),bake_anim=False)\n`);
const blender=process.env.AMES_BLENDER_PATH || 'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe';
const run=(exe,args)=>new Promise((res,rej)=>{const child=spawn(exe,args,{cwd:testRoot,windowsHide:true,stdio:'inherit'});child.on('error',rej);child.on('exit',code=>code?rej(new Error('Process failed')):res())});
await run(blender,['--background','--factory-startup','--disable-autoexec','--python-exit-code','1','--python',fixture,'--',testRoot]);
process.chdir(testRoot);
for(const ext of ['obj','stl','fbx']){
 const bytes=await readFile(join(testRoot,'fixture.'+ext));
 const source={fileId:'source-'+ext,kind:'source',filename:'fixture.'+ext,bytes:bytes.length,sha256:sha256(bytes)};
 const product={id:'format-test-'+ext,asset_id:'fixture-'+ext,name:'Format fixture',category:'ring',workflow_status:'submitted',source_hashes:[source.sha256]};
 let job=await queueJob(product,source,bytes,{sourceFileId:source.fileId,units:'unknown',assignments:{}});
 await run(process.execPath,[join(repo,'scripts/cad/worker.mjs'),'--once']);
 job=await readJob(job.id);assert.equal(job.status,'ready',job.error);assert.equal(job.result.triangleCount,12);console.log('PASS:',ext,'converted to GLB and PNG');
}
