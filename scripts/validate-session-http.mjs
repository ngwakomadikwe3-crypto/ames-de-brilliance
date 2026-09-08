import { spawn } from 'node:child_process';
import { randomBytes, createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
const secret = randomBytes(48).toString('hex');
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3081'], {
  windowsHide:true, stdio:'ignore', env:{...process.env,NODE_ENV:'production',SESSION_SECRET:secret,APPWRITE_ENDPOINT:'',APPWRITE_PROJECT_ID:'',APPWRITE_API_KEY:'',OWNER_CODE:'ames-owner',COUSIN_CODE:'ames-cousin'}
});
const base='http://127.0.0.1:3081';
function cookie(payload) { const raw=JSON.stringify(payload); return 'adb_session='+Buffer.from(raw).toString('base64url')+'.'+createHmac('sha256',secret).update(raw).digest('base64url'); }
try {
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}assert.ok(ready,'local QA server');
 const now=Date.now();
 for(const payload of [{ts:now-8*3600000,role:'owner'},{ts:now+60000,role:'owner'},{ts:now,role:'admin'}]) {
  const response=await fetch(base+'/api/requests',{headers:{cookie:cookie(payload)}});assert.equal(response.status,401);
 }
 assert.equal((await fetch(base+'/api/requests',{headers:{cookie:cookie({ts:now,role:'owner'})+'tampered'}})).status,401);
 assert.equal((await fetch(base+'/api/requests',{headers:{cookie:cookie({ts:now,role:'owner'})}})).status,200);
 for(const code of ['ames-owner','ames-cousin','toString'])assert.equal((await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})})).status,401);
 assert.equal((await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://untrusted.invalid'},body:JSON.stringify({code:'test'})})).status,403);
 const unavailable=await fetch(base+'/api/chats');assert.equal(unavailable.status,503);assert.deepEqual(await unavailable.json(),{error:'Chat storage is unavailable'});
 console.log('PASS: real HTTP session expiry, future time, invalid role, tampering, valid owner, disabled production fallback, Origin check, storage-unavailable response. Synthetic local sessions only.');
} finally {server.kill();}
