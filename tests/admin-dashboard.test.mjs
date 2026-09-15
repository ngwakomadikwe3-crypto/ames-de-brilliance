import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './jeweller-fixture.mjs';
import {documentId} from '../src/lib/customer/appwrite.mjs';
import {adminDashboard} from '../src/lib/customer/admin-dashboard.mjs';
const application=async(f,id='alice-atelier',status='VERIFIED',userId='alice')=>f.gateway.put('jewellers',id,{kind:'JEWELLER_APPLICATION',userId,email:userId+'@example.test',businessName:id,verificationStatus:status});

test('empty datasets remain available with zero counts and independent admin authorization',async()=>{
 const f=fixture();f.rows.clear();
 assert.equal((await f.request('admin/access','GET',undefined,'admin')).status,200);
 for(const who of [null,'alice','bob'])assert.ok([401,403].includes((await f.request('admin/access','GET',undefined,who)).status));
 const data=await(await f.request('admin/dashboard','GET',undefined,'admin')).json();
 for(const key of ['applications','inventory','matches','requests','events','uploads','users'])assert.deepEqual(data[key],[]);
 assert.equal(data.metrics.pendingInventory,0);assert.equal(data.metrics.sourcingMatches,0);assert.equal(data.datasets.jewellers.status,'available');
});

test('each failed dataset is isolated; unknown totals are omitted rather than fabricated',async()=>{
 for(const failed of ['jewellers','catalog','events','sourcingMatches','favorites','profiles']){
  const f=fixture(),list=f.gateway.list;await application(f);
  f.gateway.list=async(key,...args)=>{if(key===failed)throw {code:404,type:'table_not_found',message:'private backend detail'};return list(key,...args);};
  const response=await f.request('admin/dashboard','GET',undefined,'admin');assert.equal(response.status,200);
  const raw=await response.text(),data=JSON.parse(raw);assert.ok(!raw.includes('private backend detail'));assert.equal(data.datasets[failed].reason,'TABLE_NOT_FOUND');
  if(failed!=='jewellers')assert.equal(data.applications.length,1);else assert.equal(data.metrics.verifiedJewellers,undefined);
  if(failed==='catalog')assert.equal(data.metrics.pendingInventory,undefined);
  if(['events','sourcingMatches'].includes(failed))assert.equal(data.metrics.openQuoteDrafts,undefined);
 }
 const f=fixture();f.gateway.list=async key=>key==='catalog'?null:key==='events'?Promise.reject(new SyntaxError('private payload')):[];
 const data=await adminDashboard(f.gateway);assert.equal(data.datasets.catalog.reason,'READ_FAILED');assert.equal(data.datasets.events.reason,'INVALID_PAYLOAD');assert.deepEqual(data.inventory,[]);
});

test('legacy profile kind and surrounding whitespace preserve exact userId and VERIFIED authorization',async()=>{
 for(const kind of ['JEWELLER_APPLICATION','JEWELLER_PROFILE',' JEWELLER_PROFILE ']){
  const f=fixture();await f.gateway.put('jewellers','legacy',{kind,userId:'alice',verificationStatus:'VERIFIED',businessName:'Existing business'});
  assert.equal((await f.request('jewellers/me')).status,200);
  assert.equal((await(await f.request('admin/dashboard','GET',undefined,'admin')).json()).applications.length,1);
  assert.equal((await(await f.request('admin/jewellers','GET',undefined,'admin')).json()).applications.length,1);
  assert.equal((await f.request('admin/jewellers','PUT',{applicationId:'legacy',status:'SUSPENDED'},'admin')).status,200);
  assert.equal((await f.request('jewellers/me')).status,403);assert.equal((await f.gateway.get('jewellers','legacy')).kind,kind);
 }
 for(const row of [{kind:'jeweller_profile',userId:'alice',verificationStatus:'VERIFIED'},{kind:'JEWELLER_PROFILE',userId:'bob',verificationStatus:'VERIFIED'},{kind:'JEWELLER_PROFILE',userId:'alice',verificationStatus:'verified'},{kind:'JEWELLER_PROFILE',userId:'alice',verificationStatus:'VERIFIED '}]){
  const f=fixture();await f.gateway.put('jewellers','denied',row);assert.equal((await f.request('jewellers/me')).status,403);
 }
 const f=fixture();await application(f);await f.gateway.put('jewellers','duplicate',{kind:'JEWELLER_PROFILE',userId:'alice',verificationStatus:'VERIFIED'});assert.equal((await f.request('jewellers/me')).status,403);
 const original=f.gateway.user;f.gateway.user=async token=>({...await original(token),name:'Same Thwabi',email:'owner@example.test',labels:[]});assert.equal((await f.request('admin/access','GET',undefined,'admin')).status,403);assert.equal((await f.request('admin/dashboard','GET',undefined,'admin')).status,403);
});
test('admin dashboard requires exact label and admin plus verified jeweller has independent access',async()=>{const f=fixture();await application(f);for(const who of [null,'alice','bob'])assert.ok([401,403].includes((await f.request('admin/dashboard','GET',undefined,who)).status));assert.equal((await f.request('admin/dashboard','GET',undefined,'admin')).status,200);assert.equal((await f.request('jewellers/overview','GET',undefined,'admin')).status,403);await application(f,'admin-atelier','VERIFIED','admin');assert.equal((await f.request('jewellers/overview','GET',undefined,'admin')).status,200);const original=f.gateway.user;f.gateway.user=async s=>({...await original(s),labels:['AMESADMIN','amesadmin-extra']});assert.equal((await f.request('admin/dashboard','GET',undefined,'admin')).status,403);});
test('application transitions retain actor, date, notes and immutable event records',async()=>{const f=fixture();await application(f,'alice-atelier','APPLIED');for(const status of ['UNDER_REVIEW','REJECTED','UNDER_REVIEW','VERIFIED','SUSPENDED']){const r=await f.request('admin/jewellers','PUT',{applicationId:'alice-atelier',status,internalNotes:'Reviewed documents'},'admin');assert.equal(r.status,200);}const row=await f.gateway.get('jewellers','alice-atelier');assert.equal(row.reviewedBy,'admin');assert.ok(row.reviewedAt);assert.equal(row.reviewHistory.length,5);assert.equal(row.internalNotes,'Reviewed documents');assert.equal((await f.gateway.list('events')).filter(e=>e.kind==='JEWELLER_REVIEW').length,5);assert.equal((await f.request('admin/jewellers','PUT',{applicationId:'alice-atelier',status:'APPLIED'},'admin')).status,409);});
test('inventory review feedback, audit, category publication and revocation preserve one product',async()=>{const f=fixture();await application(f);for(const category of ['Rings','Watches','Bracelets','Necklaces','Earrings']){let {item}=await(await f.request('jewellers/inventory','POST',{name:'Test '+category,category})).json();await f.request('jewellers/inventory/'+item.id,'PUT',{action:'submit',revision:item.revision});for(const status of ['CHANGES_REQUESTED','REJECTED'])assert.equal((await f.request('admin/inventory','PUT',{inventoryId:item.id,status},'admin')).status,400);for(const status of ['APPROVED','SUSPENDED','CHANGES_REQUESTED','REJECTED']){assert.equal((await f.request('admin/inventory','PUT',{inventoryId:item.id,status,reviewFeedback:'Please provide source documentation'},'admin')).status,200);const publicItems=(await(await f.request('catalog')).json()).assets;assert.equal(publicItems.some(a=>a.id===item.id),status==='APPROVED');const stored=await f.gateway.get('catalog',documentId(item.id));assert.equal(stored.category,category);assert.equal(stored.jewellerId,'alice-atelier');assert.equal(stored.reviewedBy,'admin');assert.ok(stored.reviewedAt);}const own=(await(await f.request('jewellers/inventory/'+item.id)).json()).item;assert.equal(own.reviewFeedback,'Please provide source documentation');assert.ok(own.reviewedAt);}assert.equal((await f.gateway.list('catalog')).filter(i=>i.kind==='JEWELLER_INVENTORY').length,5);assert.equal((await f.gateway.list('events')).filter(i=>i.kind==='INVENTORY_REVIEW').length,20);});
test('operational counts and account directory are scoped projections without secrets',async()=>{const f=fixture();await application(f);f.gateway.accounts=async()=>[{id:'alice',name:'Alice',email:'alice@example.test',labels:['amesadmin'],status:true,createdAt:'2026-01-01',password:'secret',sessions:['secret']}];await f.gateway.put('events','request',{kind:'SOURCING_REQUEST',status:'OPEN',profile:{category:'ring',privatePhone:'secret'},notes:'secret'});await f.gateway.put('sourcingMatches','match',{kind:'SOURCING_MATCH',requestId:'request',jewellerId:'alice-atelier',response:{status:'DRAFT',price:12,currency:'USD',privateToken:'secret'}});await f.gateway.put('favorites','fav',{userId:'alice',assetId:'real'});const response=await f.request('admin/dashboard','GET',undefined,'admin'),raw=await response.text(),data=JSON.parse(raw);assert.ok(!raw.includes('secret'));assert.equal(data.metrics.verifiedJewellers,1);assert.equal(data.metrics.favorites,1);assert.equal(data.metrics.openQuoteDrafts,1);assert.equal(data.users[0].amesadmin,true);assert.equal(data.users[0].jewellers[0].id,'alice-atelier');assert.equal(data.matches[0].jewellerName,'alice-atelier');f.gateway.accounts=async()=>{throw Error('scope missing');};const fallback=await(await f.request('admin/dashboard','GET',undefined,'admin')).json();assert.equal(fallback.accountDirectoryAvailable,false);assert.equal((await f.request('admin/dashboard','PUT',{role:'amesadmin'},'alice')).status,403);});
