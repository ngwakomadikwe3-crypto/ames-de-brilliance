// Real Appwrite, real HTTP customer endpoints. No fixture service or secret output.
import {Client,Users,TablesDB,Storage,Query,Permission,Role} from 'node-appwrite';
import {InputFile} from 'node-appwrite/file';
import {randomBytes,randomUUID,createHash,createHmac} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {canonicalAssetManifest} from '@ames/engine';
import {customerConfig} from '../src/lib/customer/config.mjs';
import {createAppwriteGateway,documentId} from '../src/lib/customer/appwrite.mjs';
import {createCustomerService} from '../src/lib/customer/service.mjs';
const config=customerConfig(),client=new Client().setEndpoint(config.endpoint).setProject(config.project).setKey(config.key),users=new Users(client),db=new TablesDB(client);
const runId='qa-'+randomUUID().slice(0,8),accounts=[],qaEmails=[],catalogIds=[],cookies=[],result={runId,liveAppwrite:true,transport:'local HTTP customer service -> real Appwrite',checks:{},cleanup:{},blockers:[]};
const storage=new Storage(client),testFiles=[],testChats=[],testRows=[],nextMode=process.argv.includes('--next'),staffSecret=randomBytes(48).toString('hex');let nextProcess;
const hash=b=>createHash('sha256').update(b).digest('hex');
// Unique documentation-range client address in this local HTTP harness only.
// Production's persisted rate limiter remains enabled and unchanged.
const qaClientAddress='2001:db8:'+randomBytes(8).toString('hex').match(/.{4}/g).join(':')+'::1';
function connect(){const g=createAppwriteGateway(config);return Object.fromEntries(Object.entries(g).map(([name,fn])=>[name,async(...args)=>{try{const value=await fn(...args);if(name==='login')(result.sessionMetadata??=[]).push({secretPresent:!!value.secret,secretFormatValid:/^[A-Za-z0-9._~-]+$/.test(value.secret||''),expiryValid:Number.isFinite(Date.parse(value.expire)),expiryInFuture:Date.parse(value.expire)>Date.now()});if(name==='register'&&value?.$id&&!accounts.includes(value.$id)){accounts.push(value.$id);await persist();}return value;}catch(e){(result.diagnostics??=[]).push({operation:name,code:e.code||null,type:e.type||e.cause?.code||e.name,missingScope:String(e.message).match(/missing scopes? \(([^)]+)\)/i)?.[1]});throw e;}}]));}
// Ephemeral test signing material is never printed, persisted or installed in production.
config.deliverySecret=randomBytes(48).toString('hex');
let service,gateway;
const server=createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const response=await service.handle(new Request(config.origin+req.url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(503);res.end('{}');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+server.address().port;gateway=connect();service=createCustomerService(config,gateway);
async function request(path,method='GET',body,who=0){const response=await fetch(config.origin+'/api/customer/'+path,{method,headers:{Origin:config.origin,'X-Forwarded-For':qaClientAddress,...(cookies[who]?{Cookie:cookies[who]}:{}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const cookie=response.headers.get('set-cookie');if(cookie)cookies[who]=cookie.split(';')[0];return {status:response.status,data:response.headers.get('content-type')?.includes('json')?await response.json():Buffer.from(await response.arrayBuffer())};}
async function startNext(){if(!nextMode)return;config.origin='http://127.0.0.1:3083';result.transport='built Next application over local HTTP -> real Appwrite';nextProcess=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3083'],{windowsHide:true,stdio:'ignore',env:{...process.env,NODE_ENV:'production',AMES_APP_ORIGIN:config.origin,ASSET_DELIVERY_SECRET:config.deliverySecret,SESSION_SECRET:staffSecret,APPWRITE_AUTO_PROVISION:'false',DEEPSEEK_API_KEY:'',SMTP_HOST:'',SMTP_USER:'',SMTP_PASS:''}});for(let i=0;i<100;i++){if(nextProcess.exitCode!==null)throw Object.assign(new Error(),{type:'next_exited'});try{if((await fetch(config.origin+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Object.assign(new Error(),{type:'next_not_ready'});}
async function stopNext(){if(nextProcess&&nextProcess.exitCode===null){const exited=new Promise(r=>nextProcess.once('exit',r));nextProcess.kill();await exited;}nextProcess=null;}
async function legacy(path,method='GET',body,who=0,staff=false){const raw=JSON.stringify({ts:Date.now(),role:'owner'}),cookie=staff?'adb_session='+Buffer.from(raw).toString('base64url')+'.'+createHmac('sha256',staffSecret).update(raw).digest('base64url'):cookies[who];const r=await fetch(config.origin+'/api/'+path,{method,headers:{Origin:config.origin,...(cookie?{Cookie:cookie}:{}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
function check(name,ok){result.checks[name]=!!ok;if(!ok)throw Object.assign(new Error('Check failed'),{check:name});}
async function persist(){await mkdir('outputs',{recursive:true});await writeFile('outputs/live-appwrite-e2e.json',JSON.stringify(result,null,2));}
try{
 await startNext();
 // Detect a missing server session scope before creating any more QA accounts.
 try{await gateway.login(runId+'-scope@example.test',randomBytes(24).toString('base64url'));}catch(e){if(e.type==='general_unauthorized_scope')throw e;if(e.code!==401)throw e;}
 for(let i=0;i<2;i++){
  const email=`${runId}-${i}@example.test`,password=randomBytes(24).toString('base64url');
  qaEmails.push(email);const registered=await request('register','POST',{email,password,name:'AMES temporary live QA'},i);result.registrationStatus=registered.status;if(registered.status!==200)result.registrationError=['Session unavailable','Customer service unavailable'].includes(registered.data.error)?registered.data.error:'redacted';check('registration'+i,registered.status===200);
  const user=await request('session','GET',undefined,i);check('identity'+i,user.status===200&&!!user.data.user?.id);if(!accounts.includes(user.data.user.id))accounts.push(user.data.user.id);await persist();
  check('logout'+i,(await request('logout','POST',{},i)).status===200);
  check('login'+i,(await request('login','POST',{email,password},i)).status===200);
 }
 gateway=connect();service=createCustomerService(config,gateway);
 if(nextMode){await stopNext();await startNext();}
 check('sessionRestoration',(await request('session')).data.user?.id===accounts[0]);
 const legacyTables=['traders','stones','requests','orders','reports','stone_status_log','models','videos','comments','chats','chat_messages','report_issues','report_products','report_orders','staff','usage_log','balances'];result.directAclChecks=[];
 for(const tableId of [...legacyTables,...Object.values(config.collections)]){
  const table=await db.getTable({databaseId:config.database,tableId});check('privateTable:'+tableId,!table.$permissions.length&&table.rowSecurity);
  const columns=(await db.listColumns({databaseId:config.database,tableId,queries:[Query.limit(100)]})).columns,data={};
  for(const col of columns.filter(v=>v.required||!columns.some(a=>a.required)&&v===columns[0])){data[col.key]=col.type==='datetime'?new Date().toISOString():col.type==='boolean'?false:['integer','double','float'].includes(col.type)?Math.max(0,col.min||0):col.format==='enum'?col.elements[0]:col.format==='email'?'qa@example.test':col.key==='payload'?'{}':runId.slice(0,col.size||128);}
  const probeId=runId+'-acl',createdId=runId+'-create';await db.createRow({databaseId:config.database,tableId,rowId:probeId,data,permissions:[]});testRows.push({tableId,rowId:probeId},{tableId,rowId:createdId});
  for(const who of [0,1,2]){
   const headers={'X-Appwrite-Project':config.project,'Content-Type':'application/json',...(cookies[who]?{'X-Appwrite-Session':decodeURIComponent(cookies[who].split('=').slice(1).join('='))}:{})},base=config.endpoint+'/tablesdb/'+config.database+'/tables/'+tableId+'/rows';
   const list=await fetch(base,{headers}),listed=await list.json();check(`directReadIsolation:${tableId}:${who}`,list.ok&&listed.rows?.length===0);
   for(const method of ['POST','PATCH','DELETE']){const response=await fetch(base+(method==='POST'?'':'/'+probeId),{method,headers,body:method==='DELETE'?undefined:JSON.stringify(method==='POST'?{rowId:createdId,data}:{data})});const diagnostic=await response.json().catch(()=>({}));result.directAclChecks.push({tableId,who:who===2?'anonymous':'user'+(who===0?'A':'B'),method,status:response.status,type:diagnostic.type});check(`directMutationDenied:${tableId}:${who}:${method}`,[401,403,404].includes(response.status));}
  }
  await db.deleteRow({databaseId:config.database,tableId,rowId:probeId});await persist();
 }
 const bucket=await storage.getBucket({bucketId:config.buckets.stones});check('privateBucketConfigured',bucket.fileSecurity&&!bucket.$permissions.length);
 const glb=await readFile('public/models/canonical/ames_round_brilliant_v1.glb'),fileId=runId+'-glb';
 await storage.createFile({bucketId:config.buckets.stones,fileId,file:InputFile.fromBuffer(glb,'ames-live-qa.glb'),permissions:[]});testFiles.push({bucketId:config.buckets.stones,fileId});
 const directUrl=config.endpoint+'/storage/buckets/'+config.buckets.stones+'/files/'+fileId+'/download';
 check('rawStorageAnonymousDenied',[401,403,404].includes((await fetch(directUrl,{headers:{'X-Appwrite-Project':config.project}})).status));
 check('rawStorageOtherUserDenied',[401,403,404].includes((await fetch(directUrl,{headers:{'X-Appwrite-Project':config.project,'X-Appwrite-Session':decodeURIComponent(cookies[1].split('=').slice(1).join('='))}})).status));
 for(const kind of ['stone','ring']){
  const assetId=runId+'-'+kind;catalogIds.push(assetId);
  await gateway.put('catalog',documentId(assetId),{...canonicalAssetManifest.assets[0],id:assetId,name:'Temporary live persistence probe',category:kind,accessTier:'PRIVATE',ownerId:accounts[0],status:'published',revision:1,tags:['live-qa','temporary'],storage:{provider:'appwrite',bucketId:config.buckets.stones,fileId},userId:accounts[0],assetId,kind});
 }
 const [stone,jewelry]=catalogIds;
 check('favoriteWrite',(await request('favorites','PUT',{assetId:jewelry,userId:accounts[1]})).status===200);
 check('savedStoneWrite',(await request('saved','PUT',{assetId:stone})).status===200);
 check('savedJewelryWrite',(await request('saved','PUT',{assetId:jewelry})).status===200);
 gateway=connect();service=createCustomerService(config,gateway);
 if(nextMode){await stopNext();await startNext();}
 const restored=await request('state');check('favoritePersistence',restored.data.favorites.some(r=>r.assetId===jewelry&&r.userId===accounts[0]));check('savedStonePersistence',restored.data.saved.some(r=>r.assetId===stone&&r.kind==='stone'));check('savedJewelryPersistence',restored.data.saved.some(r=>r.assetId===jewelry&&r.kind==='jewelry'));
 const other=await request('state','GET',undefined,1);check('crossUserReadIsolation',other.status===200&&other.data.favorites.length===0&&other.data.saved.length===0);
 check('crossUserWriteIsolation',(await request('saved','PUT',{assetId:stone,userId:accounts[0]},1)).status===403);
 check('crossUserDeleteIsolation',(await request('favorites','DELETE',{assetId:jewelry,userId:accounts[0]},1)).status===403);
 check('privateCatalogIsolation',!(await request('catalog','GET',undefined,1)).data.assets.some(a=>catalogIds.includes(a.id)));
 check('protectedDenied',(await request('delivery/'+jewelry,'POST',{},1)).status===403);
 const lease=await request('delivery/'+jewelry,'POST',{});check('ownerAuthorized',lease.status===200);
 const leasePath=lease.data.url.replace(config.origin+'/api/customer/','');
 check('leaseCrossUserReplayDenied',(await request(leasePath,'GET',undefined,1)).status===403);
 check('anonymousDirectDownloadDenied',(await request('assets/'+jewelry+'.glb','GET',undefined,2)).status===401);
 const downloaded=await request(leasePath);check('authorizedPrivateGlbBytes',downloaded.status===200&&Buffer.isBuffer(downloaded.data)&&hash(downloaded.data)===hash(glb));result.privateGlb={bytes:glb.length,sha256:hash(glb),source:'unchanged canonical round GLB',note:'Ring metadata is a persistence-category probe, not newly generated jewelry.'};
 await gateway.put('entitlements',documentId(runId,'deny'),{userId:accounts[0],assetId:jewelry,effect:'deny',kind:'grant'});check('leaseRevocationRechecked',(await request(leasePath)).status===403);await gateway.remove('entitlements',documentId(runId,'deny'));
 const preview=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg==','base64'),previewId=runId+'-preview';await storage.createFile({bucketId:'media',fileId:previewId,file:InputFile.fromBuffer(preview,'ames-qa-preview.png'),permissions:[Permission.read(Role.any())]});testFiles.push({bucketId:'media',fileId:previewId});
 const previewUrl=config.endpoint+'/storage/buckets/media/files/'+previewId;const publicPreview=await fetch(previewUrl+'/download',{headers:{'X-Appwrite-Project':config.project}});check('publicPreviewReadable',publicPreview.ok&&hash(Buffer.from(await publicPreview.arrayBuffer()))===hash(preview));check('publicPreviewNotDeletable',[401,403,404].includes((await fetch(previewUrl,{method:'DELETE',headers:{'X-Appwrite-Project':config.project}})).status));
 if(nextMode){
  for(const who of [0,1,2])for(const path of ['orders','requests','reports/weekly','staff','balances','usage','intelligence/issues','intelligence/products','intelligence/orders'])for(const method of ['GET','PATCH','DELETE'])check(`legacyDenied:${who}:${method}:${path}`,[401,403,405].includes((await legacy(path,method,method==='GET'?undefined:{id:runId},who)).status));
  check('anonymousOrderCreateDenied',(await legacy('orders','POST',{stoneId:runId},2)).status===401);check('anonymousChatCreateDenied',(await legacy('chats','POST',{},2)).status===401);
  const chat=await legacy('chats','POST',{userId:accounts[1]});check('ownedChatCreated',chat.status===200&&chat.data.userId===accounts[0]);testChats.push(chat.data.id);
  const message=await legacy('chats/'+chat.data.id+'/messages','POST',{role:'user',text:'Temporary AMES ownership probe'});check('ownedChatMessage',message.status===200);
  check('otherUserChatListIsolated',!(await legacy('chats','GET',undefined,1)).data.some(v=>v.id===chat.data.id));
  for(const who of [1,2]){check('chatReadIsolation'+who,[401,404].includes((await legacy('chats/'+chat.data.id+'/messages','GET',undefined,who)).status));check('chatWriteIsolation'+who,[401,404].includes((await legacy('chats/'+chat.data.id+'/messages','POST',{role:'user',text:'denied'},who)).status));check('chatTitleIsolation'+who,[401,404].includes((await legacy('chats/'+chat.data.id,'PATCH',{title:'denied'},who)).status));}
  check('chatOwnershipImmutable',(await legacy('chats/'+chat.data.id,'PATCH',{title:'QA title',userId:accounts[1]})).data.userId===accounts[0]);
  const mine=await legacy('chats');check('oldUnownedChatsHidden',mine.data.every(v=>v.userId===accounts[0]));check('staffChatRead',(await legacy('chats/'+chat.data.id+'/messages','GET',undefined,2,true)).status===200);check('staffOrdersRead',(await legacy('orders','GET',undefined,2,true)).status===200);
  check('publicCatalogLoads',(await legacy('stones','GET',undefined,2)).status===200);check('publicVideosLoad',(await legacy('videos?published=1','GET',undefined,2)).status===200);check('guestChatStillReplies',typeof (await legacy('chat','POST',{message:'Hello',history:[]},2)).data.reply==='string');
  check('modelProfileGuestDenied',(await legacy('model/profile','POST',{},2)).status===401);check('traderProfileGuestDenied',(await legacy('trader/profile','POST',{},2)).status===401);
  await users.updateLabels({userId:accounts[1],labels:['amesadmin']});check('realAppwriteAdminIdentity',(await request('session','GET',undefined,1)).data.user?.admin===true);check('realAdminLegacyRead',(await legacy('orders','GET',undefined,1)).status===200);
  await users.updateLabels({userId:accounts[1],labels:[]});check('adminRevocation',(await legacy('orders','GET',undefined,1)).status===401);
 }
 const oldCookie=cookies[0];check('logoutRevokesSession',(await request('logout','POST',{})).status===200);cookies[0]=oldCookie;check('revokedSessionRejected',(await request('session')).status===401);
}catch(e){result.failure={check:e.check||null,code:e.code||null,type:e.type||e.cause?.code||e.name};process.exitCode=1;}
finally{
 for(const row of testRows){try{await db.deleteRow({databaseId:config.database,...row});}catch(e){if(e.code!==404)result.cleanup.aclRows=false;}}result.cleanup.aclRows=result.cleanup.aclRows!==false;
 for(const chatId of testChats){try{const messages=await db.listRows({databaseId:config.database,tableId:'chat_messages',queries:[Query.equal('chat_id',chatId),Query.limit(100)]});for(const r of messages.rows)await db.deleteRow({databaseId:config.database,tableId:'chat_messages',rowId:r.$id});await db.deleteRow({databaseId:config.database,tableId:'chats',rowId:chatId});}catch{result.cleanup.chats=false;}}
 for(const file of testFiles){try{await storage.deleteFile(file);}catch{result.cleanup.files=false;}}result.cleanup.files=result.cleanup.files!==false;
 for(const email of qaEmails){try{const found=await users.list({queries:[Query.equal('email',email)]});for(const u of found.users)if(!accounts.includes(u.$id))accounts.push(u.$id);}catch(e){result.cleanup.accountDiscovery={code:e.code||null,type:e.type||'cleanup_failed'};}}
 // Remove only this run's metadata/state and accounts; never delete pre-existing records.
 for(const k of ['profiles','favorites','saved','entitlements','subscriptions','designs','events']){try{for(const userId of accounts){for(const row of await gateway.list(k,{userId}))await gateway.remove(k,row.id);}result.cleanup[k]=true;}catch(e){result.cleanup[k]={code:e.code||null,type:e.type||'cleanup_failed'};}}
 for(const assetId of catalogIds){try{await gateway.remove('catalog',documentId(assetId));}catch{result.cleanup.catalog=false;}}
 for(const userId of accounts){try{await users.delete({userId});try{await users.get({userId});throw new Error('QA remains');}catch(e){if(e.code!==404)throw e;}}catch(e){(result.cleanup.remainingUserIds??=[]).push(userId);result.cleanup.userError={code:e.code||null,type:e.type||'cleanup_failed'};}}
 result.cleanup.catalog=result.cleanup.catalog!==false;result.cleanup.users=!result.cleanup.accountDiscovery&&!result.cleanup.remainingUserIds?.length;
 await stopNext();await new Promise(r=>server.close(r));await persist();console.log(JSON.stringify({runId,transport:result.transport,checks:Object.keys(result.checks).length,failedChecks:Object.entries(result.checks).filter(([,v])=>!v).map(([k])=>k),failure:result.failure,privateGlb:result.privateGlb,cleanup:result.cleanup,blockers:result.blockers}));
}
