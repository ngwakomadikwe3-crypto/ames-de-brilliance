import {spawn} from 'node:child_process';
import {mkdir,writeFile,appendFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID,createHmac} from 'node:crypto';
import {newAssetBrief} from '../src/lib/ames-asset-standard.ts';
const root=resolve('.ames-cad/tests','asset-standard-ui-'+randomUUID());await mkdir(root,{recursive:true});
const secret='isolated-asset-standard-browser-secret-not-production',payload=JSON.stringify({ts:Date.now(),role:'owner'}),cookie=Buffer.from(payload).toString('base64url')+'.'+createHmac('sha256',secret).update(payload).digest('base64url'),origin='http://localhost:3012';
const brief=newAssetBrief('educational-diamond-review');brief.product.name='Educational diamond — scale unverified';brief.components=[{id:'educational-diamond',nodeName:'Gemstone Diamond',role:'gemstone',surface:'faceted',materialPreset:'preserve-source',finish:'polished',color:null,evidenceIds:[]}];brief.product.category='loose-diamond';await writeFile(join(root,'brief.json'),JSON.stringify(brief));
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--turbopack','--hostname','localhost','--port','3012'],{windowsHide:true,env:{...process.env,VERCEL:'',SESSION_SECRET:secret,AMES_QA_DIST_DIR:'.next-asset-standard-qa-turbo'},stdio:['ignore','pipe','pipe']});for(const s of[child.stdout,child.stderr])s.on('data',b=>appendFile(join(root,'next.log'),b).catch(()=>{}));
try{
 const end=Date.now()+900000;let html;while(true){try{const r=await fetch(origin+'/dashboard/asset-standard',{headers:{Cookie:'adb_session='+cookie},signal:AbortSignal.timeout(900000)});if(r.status===200){html=await r.text();break;}}catch{}if(Date.now()>end)throw Error('Workbench readiness timed out');await new Promise(r=>setTimeout(r,1000));}
 const scripts=[...html.matchAll(/src="(\/_next\/[^"<>]+\.js[^"<>]*)"/g)].map(m=>m[1].replaceAll('&amp;','&'));for(let i=0;i<scripts.length;i+=4)await Promise.all(scripts.slice(i,i+4).map(async path=>{const r=await fetch(origin+path);if(!r.ok)throw Error('Script unavailable');await r.arrayBuffer();}));
 await writeFile(join(root,'browser.json'),JSON.stringify({origin,cookie,root,brief:join(root,'brief.json'),model:resolve('public/ames-engine/stone-diamond/web/jewelry.glb')}));const browser=spawn('python',['scripts/verify-asset-standard-ui.py',join(root,'browser.json')],{windowsHide:true,stdio:'inherit'});await new Promise((ok,fail)=>{browser.on('error',fail);browser.on('close',c=>c===0?ok():fail(Error('Asset workbench browser verification failed')));});console.log('PASS staff-only local asset workbench:',root);
}finally{if(child.pid){const stop=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});await new Promise(r=>stop.on('close',r));}}
