// Production Next build + real SDK + explicitly synthetic Appwrite HTTP fixture.
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:https';
import {request as proxyRequest} from 'node:http';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {startFixture} from '../tests/appwrite-fixture.mjs';
import {documentId} from '../src/lib/customer/appwrite.mjs';
const engine=process.env.AMES_ENGINE_WORKSPACE;if(!engine)throw new Error('Set AMES_ENGINE_WORKSPACE to the existing engine workspace (Playwright + generated ring).');
const {chromium}=await import(pathToFileURL(join(engine,'node_modules/playwright/index.mjs')).href);
const dir=await mkdtemp(join(tmpdir(),'ames-customer-qa-'));
execFileSync('C:/Program Files/Git/usr/bin/openssl.exe',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','1','-subj','/CN=localhost'],{stdio:'ignore',windowsHide:true});
const f=await startFixture({glb:await readFile('public/models/canonical/ames_round_brilliant_v1.glb'),ring:await readFile(join(engine,'public/models/generated/ames_ring_oval_hidden_halo_v1.glb'))});
const proxy=createServer({key:await readFile(join(dir,'key.pem')),cert:await readFile(join(dir,'cert.pem'))},(req,res)=>{const p=proxyRequest({hostname:'127.0.0.1',port:3082,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});p.on('error',()=>{res.writeHead(502);res.end();});req.pipe(p);});
await new Promise(r=>proxy.listen(0,'127.0.0.1',r));const origin='https://127.0.0.1:'+proxy.address().port;
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3082','-H','127.0.0.1'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,APPWRITE_ENDPOINT:f.endpoint,APPWRITE_PROJECT_ID:f.project,APPWRITE_API_KEY:f.key,AMES_APP_ORIGIN:origin,ASSET_DELIVERY_SECRET:randomBytes(48).toString('hex'),SESSION_SECRET:randomBytes(32).toString('hex')}});let logs='';app.stdout.on('data',d=>logs+=d);app.stderr.on('data',d=>logs+=d);
let browser;try{
 for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:3082/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:900}});const page=await context.newPage();page.setDefaultTimeout(45000);
 await page.addInitScript(()=>sessionStorage.setItem('ames-intro-seen','1'));await page.goto(origin+'/account');await page.locator('input[name=email]').fill('alice@example.test');await page.locator('input[name=password]').fill(f.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/app');
 const api=(path,method='GET',body)=>page.evaluate(async({path,method,body})=>{const r=await fetch('/api/customer/'+path,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};},{path,method,body});
 const sessionCookie=(await context.cookies()).find(c=>c.name==='__Host-ames_customer');assert.ok(sessionCookie);assert.equal(sessionCookie.secure,true);assert.equal(sessionCookie.httpOnly,true);assert.equal(sessionCookie.sameSite,'Lax');assert.equal(sessionCookie.path,'/');
 await page.locator('[data-stone]').waitFor();await page.getByRole('button',{name:'Boutique',exact:true}).click();const favorite=page.locator('[data-favorite]');await favorite.scrollIntoViewIfNeeded();await favorite.click();await page.waitForFunction(()=>document.querySelector('[data-favorite]')?.textContent==='Remove favorite');assert.equal((await api('state')).data.favorites[0].assetId,'fixture-ring');
 await page.reload();await page.locator('[data-stone]').waitFor();await page.getByRole('button',{name:'Boutique',exact:true}).click();await favorite.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('[data-favorite]')?.textContent==='Remove favorite');
 await page.getByRole('button',{name:'Chat',exact:true}).click();await page.locator('[data-stone]').selectOption('stone-002');await page.getByRole('button',{name:'Save stone',exact:true}).click();await page.waitForFunction(()=>document.body.textContent.includes('Stone saved to your account'));await page.reload();await page.waitForFunction(()=>document.querySelector('[data-stone]')?.value==='stone-002');assert.equal((await api('state')).data.saved[0].assetId,'stone-002');
 assert.equal((await api('delivery/fixture-premium','POST',{})).status,403);
 const admin=await context.request.post(origin+'/api/customer/login',{headers:{origin},data:{email:'admin@example.test',password:f.password}});assert.equal(admin.status(),200);
 const grant=await context.request.put(origin+'/api/customer/admin/entitlements',{headers:{origin},data:{userId:'alice',tier:'PREMIUM',effect:'allow',expiresAt:new Date(Date.now()+3600000).toISOString()}});assert.equal(grant.status(),200);
 await context.request.post(origin+'/api/customer/login',{headers:{origin},data:{email:'alice@example.test',password:f.password}});
 const lease=await api('delivery/fixture-premium','POST',{});assert.equal(lease.status,200);assert.equal((await context.request.get(lease.data.url)).status(),200);
 const anonymous=await browser.newContext({ignoreHTTPSErrors:true});assert.equal((await anonymous.request.get(lease.data.url)).status(),401);await anonymous.close();
 f.rows.delete('catalog_assets:'+documentId('fixture-ring'));
 const loaded=page.waitForResponse(r=>r.url().includes('/assets/fixture-premium.glb?')&&r.status()===200);
 await page.reload();await page.locator('[data-stone]').waitFor();assert.equal(await page.locator('[data-panel="0"] canvas').count(),0);await page.getByRole('button',{name:'Boutique',exact:true}).click();await loaded;await page.waitForFunction(()=>document.querySelector('[data-title]')?.textContent==='fixture-premium'&&document.querySelector('[data-access]')?.textContent.includes('Available')&&!document.querySelector('[data-error]')?.textContent);
 const guestContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844}}),guest=await guestContext.newPage();let guestHistoryRequests=0;guest.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/chats'))guestHistoryRequests++;});await guest.addInitScript(()=>sessionStorage.setItem('ames-intro-seen','1'));await guest.goto(origin+'/app');await guest.locator('[data-stone]').waitFor();
 await guest.getByPlaceholder('Ask SAME anything...').fill('hello');await Promise.all([guest.waitForResponse(r=>new URL(r.url()).pathname==='/api/chat'&&r.status()===200),guest.getByPlaceholder('Ask SAME anything...').press('Enter')]);await guest.getByText('hello',{exact:true}).waitFor();assert.equal(guestHistoryRequests,0);
 await guest.getByPlaceholder('Ask SAME anything...').fill('show stone-005');await guest.getByPlaceholder('Ask SAME anything...').press('Enter');await guest.waitForFunction(()=>document.querySelector('[data-stone]')?.value==='stone-005');
 const videoFeed=await guest.evaluate(async()=>{const r=await fetch('/api/videos?published=1');return {status:r.status,data:await r.json()};});assert.equal(videoFeed.status,200);assert.ok(Array.isArray(videoFeed.data));await guest.getByRole('button',{name:'Videos',exact:true}).click();await guest.waitForFunction(()=>Math.abs(document.querySelector('[data-panel="2"]').getBoundingClientRect().left)<5);await guestContext.close();
 const result={fixtureOnly:true,liveAppwrite:false,favoriteReload:true,stoneSaveReload:true,sessionRestore:true,protectedDenied:true,adminGrant:true,signedAuthorizedDownload:true,engineProtectedLoad:true,anonymousLeaseReplayDenied:true,guestChatEphemeral:true,guestStoneCommand:true,videoNavigationAndFeed:true,browser:'desktop Chrome + 390px viewport',output:dir};await writeFile(join(dir,'result.json'),JSON.stringify(result,null,2));await writeFile(join(engine,'../../outputs/customer-backend-proof.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(e){console.error('Customer E2E failed:',e.message);console.error(logs.slice(-2000));throw e;}finally{await browser?.close();app.kill();await new Promise(r=>proxy.close(r));await f.close();}
