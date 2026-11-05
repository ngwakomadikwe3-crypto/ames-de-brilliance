import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {blenderEnvironment} from './cad/worker-env.mjs';
import {inspectGlb} from '../src/lib/ames-glb-audit.ts';
import {evaluateModel} from '../src/lib/ames-asset-standard.ts';
const project=process.cwd(),parent=process.env.AMES_ASSET_QA_ROOT||join(homedir(),'.ames','qa-assets'),root=join(parent,'asset-standard-'+randomUUID());await mkdir(parent,{recursive:true});
const blender=process.env.BLENDER_PATH||'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
const child=spawn(blender,['--background','--factory-startup','--threads','2','--python-exit-code','1','--python',resolve('scripts/blender/build_asset_standard_calibration.py'),'--',project,root],{env:blenderEnvironment(),windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';for(const stream of[child.stdout,child.stderr])stream.on('data',b=>{log+=b;for(const line of b.toString().split(/\r?\n/))if(line.startsWith('AMES:'))console.log(line);if(log.length>1000000)log=log.slice(-1000000);});
try{await new Promise((ok,fail)=>{child.on('error',fail);child.on('close',c=>c===0?ok():fail(Error(log.slice(-5000))));});const folder=join(root,'delivery'),brief=JSON.parse(await readFile(join(folder,'brief.json'),'utf8')),bytes=await readFile(join(folder,'model.glb')),report=evaluateModel(brief,inspectGlb(bytes),createHash('sha256').update(bytes).digest('hex'));await writeFile(join(root,'blender.log'),log);await writeFile(join(root,'audit.json'),JSON.stringify(report,null,2));if(report.blockers.length)throw Error('Calibration failed technical checks: '+report.blockers.join(' '));if(report.publicationApproved||report.manufacturingCertified)throw Error('Calibration must not grant commercial approval');console.log('PASS real Blender source, metre-scale GLB, six studio views, provenance and technical audit:',root);}catch(e){await mkdir(root,{recursive:true});await writeFile(join(root,'blender.log'),log);throw e;}
