import { readdir, mkdir, readFile, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { root, jobDir, readJob, atomicJson, sha256, validateSource } from './store.mjs';

import { blenderEnvironment } from './worker-env.mjs';
import { runSandbox } from './sandbox.mjs';

if (process.env.NODE_ENV === 'production' && process.env.AMES_CAD_SANDBOX !== '1') throw new Error('Production CAD requires isolated per-job containers');
const blender = process.env.AMES_BLENDER_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe' : 'blender');
const once = process.argv.includes('--once');
await mkdir(root(), {recursive:true});
// One worker per local queue. A stale lock must be inspected, not stolen from a running conversion.
const lockPath = join(root(),'worker.lock');
const lock = await open(lockPath,'wx').catch(() => { throw new Error('CAD worker lock exists. Check the previous worker before removing .ames-cad/worker.lock.'); });
await lock.writeFile(String(process.pid));
const heartbeat = () => atomicJson(join(root(),'worker.json'),{at:new Date().toISOString()});
let heartbeatBusy = false;
const timer = setInterval(async () => { if (heartbeatBusy) return; heartbeatBusy=true; try { await heartbeat(); } catch(error) { console.error(error.message); } finally { heartbeatBusy=false; } },5000);
let stopping = false;
process.on('SIGINT',()=>{stopping=true}); process.on('SIGTERM',()=>{stopping=true});
async function convert(job) {
  const dir = jobDir(job.id);
  const input = await readFile(join(dir,'source.'+job.extension));
  if (sha256(input)!==job.sourceSha256) throw new Error('Stored source checksum mismatch');
  validateSource(job.sourceFilename,input);
  if (process.env.AMES_CAD_SANDBOX === '1') await runSandbox(dir);
  else await new Promise((resolveRun,reject) => {
    const child = spawn(blender,['--background','--factory-startup','--disable-autoexec','--threads','2','--python-exit-code','1','--python',fileURLToPath(new URL('./convert.py', import.meta.url)),'--',dir],{windowsHide:true,env:blenderEnvironment(),stdio:['ignore','pipe','pipe']});
    let output=''; const collect=data=>{output=(output+data.toString()).slice(-12000)};
    child.stdout.on('data',collect);child.stderr.on('data',collect);
    const timeout=setTimeout(()=>{child.kill();reject(new Error('Conversion exceeded 5 minutes. '+output.slice(-1500)))},300000);
    child.on('error',error=>{clearTimeout(timeout);reject(error)});
    child.on('close',code=>{clearTimeout(timeout);if(code===0) resolveRun(); else reject(new Error('Conversion failed. Check the source geometry and format. '+output.slice(-1500)))});
  });
  return JSON.parse(await readFile(join(dir,'result.json'),'utf8'));
}
try {
  // Interrupted jobs become retryable failures; never present partial files as ready.
  for (const id of await readdir(join(root(),'jobs')).catch(()=>[])) {
    const job=await readJob(id).catch(()=>null);
    if(job?.status==='processing') await atomicJson(join(jobDir(id),'job.json'),{...job,status:'failed',error:'Worker interrupted. Queue a fresh preview.'});
  }
  do {
    await heartbeat();
    const jobs=await Promise.all((await readdir(join(root(),'jobs')).catch(()=>[])).map(id=>readJob(id).catch(()=>null)));
    const job=jobs.filter(j=>j?.status==='queued').sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0];
    if(job){
      await atomicJson(join(jobDir(job.id),'job.json'),{...job,status:'processing'});
      console.log('Converting',job.id,job.extension);
      try { const result=await convert(job); await atomicJson(join(jobDir(job.id),'job.json'),{...job,status:'ready',result,completedAt:new Date().toISOString()}); console.log('Ready',job.id); }
      catch(error){await atomicJson(join(jobDir(job.id),'job.json'),{...job,status:'failed',error:error.message});console.error(error.message);}
    } else if(!once && !stopping) await new Promise(r=>setTimeout(r,2000));
    if(once) break;
  } while(!stopping);
} finally { clearInterval(timer);await lock.close();await unlink(lockPath);await unlink(join(root(),'worker.json')).catch(()=>{}); }
