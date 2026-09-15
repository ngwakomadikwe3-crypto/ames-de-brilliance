// Fixture-only browser verification; does not read or mutate live Appwrite data.
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {startFixture} from '../tests/appwrite-fixture.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.AMES_PLAYWRIGHT_PATH||'C:/Users/ngwak/Documents/Codex/2026-09-07/github-plugin-github-openai-curated-remote/work/ames-engine/node_modules/playwright');
const f=await startFixture(),origin='http://127.0.0.1:3122';f.rows.clear();f.sessions.set('admin-session','admin');f.sessions.set('alice-session','alice');
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3122','-H','127.0.0.1'],{env:{...process.env,APPWRITE_ENDPOINT:f.endpoint,APPWRITE_PROJECT_ID:f.project,APPWRITE_API_KEY:f.key,APPWRITE_DATABASE_ID:'ames',APPWRITE_COLLECTION_JEWELLERS:'jeweller_sources',APPWRITE_COLLECTION_SOURCING_MATCHES:'sourcing_matches',AMES_APP_ORIGIN:origin,ASSET_DELIVERY_SECRET:'fixture-only-'.repeat(8)},windowsHide:true,stdio:'ignore'});
let browser,page;const checks=[];
const put=(table,id,payload,kind,userId='')=>f.rows.set(table+':'+id,{$id:id,$permissions:[],userId,assetId:'',kind,payload:JSON.stringify(payload),updatedAt:new Date().toISOString()});
try{
 for(let i=0;i<100;i++){try{if((await fetch(origin+'/login')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await mkdir('outputs/admin-resilience',{recursive:true});
 await page.goto(origin+'/admin');await page.getByRole('heading',{name:'Sign in to access admin'}).waitFor();
 await page.context().addCookies([{name:'ames_customer',value:'alice-session',url:origin}]);await page.goto(origin+'/admin');await page.getByRole('heading',{name:'Admin access required'}).waitFor();
 await page.context().addCookies([{name:'ames_customer',value:'admin-session',url:origin}]);await page.goto(origin+'/admin');
 const nav=page.getByRole('navigation',{name:'Admin dashboard'});await nav.waitFor();
 const sections=['Overview','Jeweller applications','Inventory review','Videos','Users / Roles','Sourcing','Analytics','System / Audit'];
 for(const section of sections){await nav.getByRole('button',{name:section,exact:true}).click();await page.getByRole('heading',{name:section==='Videos'?'Video':section,exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks.push({section,emptyRender:true});}
 await page.getByText('Same Thwabi',{exact:true}).waitFor();await page.screenshot({path:'outputs/admin-resilience/about-mobile.png'});
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'outputs/admin-resilience/about-desktop.png'});
 await nav.getByRole('button',{name:'Overview',exact:true}).click();assert.equal(await page.getByText('Same Thwabi',{exact:true}).count(),0);
 // Reproduce a broken dataset during server rendering without breaking identity reads.
 f.rows.set('analytics_events:invalid',{$id:'invalid',kind:'SOURCING_REQUEST',userId:'',assetId:'',payload:'invalid JSON'});
 await page.goto(origin+'/admin');await nav.waitFor();await page.getByRole('alert').filter({hasText:'Requests and events unavailable'}).waitFor();
 await nav.getByRole('button',{name:'Inventory review',exact:true}).click();await page.getByText('No inventory in this state.').waitFor();
 await nav.getByRole('button',{name:'Videos',exact:true}).click();await page.getByRole('button',{name:'New video',exact:true}).waitFor();
 await page.getByLabel('Video file',{exact:true}).setInputFiles('public/intro.mp4');await page.locator('.ames-admin-video video').waitFor();
 await page.getByLabel('Caption',{exact:true}).fill('Fixture draft');await page.getByRole('button',{name:'Save draft / unpublish',exact:true}).click();await page.getByText('Video saved.',{exact:true}).waitFor();
 f.rows.delete('analytics_events:invalid');
 put('jeweller_sources','legacy',{businessName:'Fixture verified business',verificationStatus:'VERIFIED'},'JEWELLER_PROFILE ','admin');
 await page.goto(origin+'/admin');await nav.getByRole('button',{name:'Jeweller applications',exact:true}).click();await page.getByRole('heading',{name:'Fixture verified business'}).waitFor();
 await page.goto(origin+'/jewellers/portal');await page.getByRole('navigation',{name:'Jeweller dashboard'}).waitFor();
 await page.goto(origin+'/admin');await page.route('**/api/customer/admin/dashboard',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Fixture unavailable'})}));
 await page.getByRole('button',{name:'Refresh data',exact:true}).click();await page.getByRole('alert').filter({hasText:'Dashboard data could not refresh'}).waitFor();await nav.getByRole('button',{name:'System / Audit',exact:true}).click();await page.getByText('Same Thwabi',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);const result={checks,guestDenied:true,customerDenied:true,adminAllowed:true,brokenDatasetIsolated:true,legacyVerifiedPortal:true,videoDraftSaved:true,ownerAboutOnly:true,refreshFailureShell:true,browserErrors:errors};console.log(JSON.stringify(result));await writeFile('outputs/admin-resilience/checks.json',JSON.stringify(result,null,2));
}catch(e){if(page)await page.screenshot({path:'outputs/admin-resilience/failure.png'});throw e;}finally{await browser?.close();child.kill();await f.close();}
