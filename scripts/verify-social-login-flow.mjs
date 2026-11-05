/** Real Next/browser flow with loopback OAuth/Appwrite test doubles. No real accounts or emails. */
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,appendFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
const root=resolve('.ames-cad/tests','social-login-'+randomUUID());await mkdir(root,{recursive:true});
const origin='http://localhost:3012',tokens=new Map(),sessions=new Map();
const identity=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');res.setHeader('Content-Type','application/json');
 const fail=()=>{res.statusCode=401;res.end(JSON.stringify({code:401,type:'user_unauthorized',message:'Fixture identity unavailable'}));};
 if(url.pathname.startsWith('/v1/account/tokens/oauth2/')){
  const provider=url.pathname.split('/').at(-1);if(!['google','tiktok'].includes(provider))return fail();
  const callback=new URL(url.searchParams.get('success'));if(callback.origin!==origin)throw Error('Unexpected fixture callback');
  const token=randomUUID(),userId='fixture-'+provider;tokens.set(token,{userId,provider});callback.searchParams.set('userId',userId);callback.searchParams.set('secret',token);res.writeHead(302,{Location:callback.href});return res.end();
 }
 let body={};if(['POST','PATCH'].includes(req.method)){let raw='';for await(const c of req)raw+=c;body=raw?JSON.parse(raw):{};}
 if(url.pathname==='/v1/account/sessions/token'&&req.method==='POST'){
  const token=tokens.get(body.secret);if(!token||token.userId!==body.userId)return fail();tokens.delete(body.secret);
  const secret=randomUUID(),user={$id:token.userId,name:'Fixture '+token.provider,email:token.provider==='google'?'google@example.invalid':'',emailVerification:token.provider==='google',status:true,prefs:{},passwordUpdate:''};sessions.set(secret,user);
  return res.end(JSON.stringify({userId:user.$id,secret,expire:new Date(Date.now()+86400000).toISOString()}));
 }
 if(url.pathname.startsWith('/v1/account')){
  const user=sessions.get(req.headers['x-appwrite-session']);if(!user)return fail();
  if(url.pathname==='/v1/account/password'&&req.method==='PATCH'){user.password=body.password;user.passwordUpdate=new Date().toISOString();}
  if(url.pathname==='/v1/account/email'&&req.method==='PATCH'){if(user.password!==body.password||user.email)return fail();user.email=body.email;user.emailVerification=false;}
  if(url.pathname==='/v1/account/verification'&&req.method==='POST')return res.end(JSON.stringify({$id:'fixture-verification-no-email-sent'}));
  const {password,...safe}=user;return res.end(JSON.stringify(safe));
 }
 if(url.pathname.startsWith('/v1/databases/')){
  if(url.pathname.endsWith('/attributes'))return res.end(JSON.stringify({attributes:['title','owner_id','provider_id','created_at','updated_at','chat_id','role','text','thinking','expires_at','count'].map(key=>({key,status:'available'}))}));
  if(url.pathname.endsWith('/indexes'))return res.end(JSON.stringify({indexes:['private_owner','private_chat_date','quota_expiry'].map(key=>({key,status:'available'}))}));
  if(url.pathname.includes('/collections/')&&!url.pathname.includes('/documents'))return res.end(JSON.stringify({$permissions:[],documentSecurity:false}));
  return res.end(JSON.stringify({$id:'fixture-quota',count:1}));
 }
 res.statusCode=404;res.end('{}');
});await new Promise(r=>identity.listen(0,'127.0.0.1',r));
const env={...process.env,VERCEL:'',SESSION_SECRET:'isolated-social-test-session-secret-not-production',APPWRITE_ENDPOINT:`http://127.0.0.1:${identity.address().port}/v1`,APPWRITE_PROJECT_ID:'isolated-social',APPWRITE_API_KEY:'isolated-fixture-server-key',AMES_AUTH_ORIGIN:origin,AMES_SOCIAL_PROVIDERS:'google,tiktok',AMES_LISTING_STORAGE:'local',AMES_LISTING_ROOT:join(root,'listings'),AMES_QA_DIST_DIR:'.next-social-login-qa'};
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--port','3012','--hostname','localhost'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});for(const s of[child.stdout,child.stderr])s.on('data',b=>appendFile(join(root,'next.log'),b).catch(()=>{}));
try{
 const end=Date.now()+300000;while(true){try{if((await fetch(origin+'/api/customer/oauth')).ok)break;}catch{}if(Date.now()>end)throw Error('Next readiness timeout');await new Promise(r=>setTimeout(r,1000));}
 for(const path of ['/app/account','/workspace']){const r=await fetch(origin+path),html=await r.text();if(!r.ok)throw Error('Page unavailable');const scripts=[...html.matchAll(/src="(\/_next\/[^"<>]+\.js[^"<>]*)"/g)].map(m=>m[1].replaceAll('&amp;','&'));for(let i=0;i<scripts.length;i+=3)await Promise.all(scripts.slice(i,i+3).map(async s=>{const r=await fetch(origin+s);if(!r.ok)throw Error('Script unavailable');await r.arrayBuffer();}));}
 await writeFile(join(root,'browser.json'),JSON.stringify({origin,output:root}));
 const browser=spawn('python',['scripts/verify-social-login-ui.py',join(root,'browser.json')],{windowsHide:true,stdio:'inherit'});await new Promise((done,fail)=>{browser.on('error',fail);browser.on('close',c=>c===0?done():fail(Error('Social browser verification failed')));});
 await writeFile(join(root,'report.json'),JSON.stringify({passed:true,productionAccounts:false,emailsSent:false,providers:'loopback OAuth/Appwrite test doubles',application:'real Next routes and browser',checks:['Google redirects and HttpOnly session','TikTok missing-email completion','contact email remains unverified','professional onboarding gate','state cookie removed','session secret unavailable to browser JavaScript','no mobile overflow or browser errors'],at:new Date().toISOString()},null,2));
 console.log('PASS simulated provider round trips through real application/browser; evidence:',root);
}finally{if(child.pid){const kill=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});await new Promise(r=>kill.on('close',r));}identity.closeAllConnections();await new Promise(r=>identity.close(r));}
