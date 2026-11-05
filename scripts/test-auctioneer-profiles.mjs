import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {newProfile,profileInput,profileGaps,reviewProfile,blankChecks,editProfile,effectiveProfileStatus} from '../src/lib/auctioneer-profile.ts';
const now='2026-10-28T12:00:00Z';
const details={businessName:'Isolated auction fixture',legalName:'Fixture representative',registrationNumber:'QA-ONLY',email:'fixture@example.invalid',phone:'+26777123456',country:'Botswana',city:'Fixture city',address:'Private fixture address',biography:'An isolated professional biography fixture, not a real auction business.',specialties:['Gemstones'],auctionHistory:'Professional auction experience and reference history described for this isolated fixture.',consignmentPolicy:'Seller identity, ownership, reserves, commissions and written consignment authority are checked before any fixture lot.',buyerTerms:'Buyer fees, payment deadlines, taxes, collection, delivery and returns are described before bidding in this fixture.',eligibilityReason:'Fixture eligibility explanation only. No legal or regulatory finding is represented.',consentConfirmed:true};
function complete(){const p=newProfile(randomUUID(),details,now);p.files=['identity','business','reference'].map((kind,i)=>({id:randomUUID(),kind,filename:'fixture.pdf',bytes:30,mime:'application/pdf',sha256:String(i).repeat(64),uploadedAt:now,expiresOn:''}));return p;}
const verify={action:'verify',checks:Object.fromEntries(Object.keys(blankChecks()).map(k=>[k,true])),reason:'Isolated fixture checks only, not a real professional verification.',validUntil:'2027-01-28'};
test('auctioneer profiles cannot forge ownership, verification, operational permissions or jeweller categories',()=>{
 for(const field of ['portalUserId','status','checks','canBid','storefront'])assert.throws(()=>profileInput.parse({...details,[field]:'forged'}));
 assert.throws(()=>profileInput.parse({...details,specialties:['CAD']}));assert.equal(newProfile(randomUUID(),details,now).status,'draft');
});
test('auction experience, seller authority and buyer terms are required separately',()=>{
 const p=complete();assert.deepEqual(profileGaps(p,now),[]);
 for(const field of ['auctionHistory','consignmentPolicy','buyerTerms'])assert.ok(profileGaps({...p,[field]:''},now).length);
 assert.ok(profileGaps({...p,files:p.files.filter(f=>f.kind!=='reference')},now).length);
 const reused=complete();reused.files[2].sha256=reused.files[0].sha256;assert.ok(profileGaps(reused,now).length);
});
test('verification requires submission, every staff check, findings and a current expiry',()=>{
 const p=complete();assert.throws(()=>reviewProfile(p,verify,now));
 const s=reviewProfile(p,{action:'submit'},now,'account:fixture');assert.equal(s.audit.at(-1).actor,'account:fixture');
 assert.throws(()=>reviewProfile(s,{...verify,checks:{...verify.checks,consignment:false}},now));
 assert.throws(()=>reviewProfile(s,{...verify,reason:'short'},now));
 assert.throws(()=>reviewProfile(s,{...verify,validUntil:'2028-01-01'},now));
 const v=reviewProfile(s,verify,now);assert.equal(effectiveProfileStatus(v,now),'verified');assert.equal(effectiveProfileStatus(v,'2027-02-01T12:00:00Z'),'review_expired');assert.equal('canBid' in v,false);
});
test('required licences need evidence and cap review expiry; expired references block review',()=>{
 const p=complete();p.licenceRequired=true;p.licenceNumber='QA';p.licenceIssuer='Fixture authority';p.licenceExpires='2026-12-01';assert.ok(profileGaps(p,now).length);
 p.files.push({...p.files[2],id:randomUUID(),kind:'licence'});assert.deepEqual(profileGaps(p,now),[]);
 assert.throws(()=>reviewProfile(reviewProfile(p,{action:'submit'},now),verify,now),/licence expiry/);
 p.files.find(f=>f.kind==='reference').expiresOn='2020-01-01';assert.ok(profileGaps(p,now).length);
});
test('editing, revisions and suspension clear verification and retain an audit trail',()=>{
 const v=reviewProfile(reviewProfile(complete(),{action:'submit'},now),verify,now);
 const edited=editProfile(v,details,'account:fixture');assert.equal(edited.status,'draft');assert.equal(edited.verifiedUntil,'');assert.ok(Object.values(edited.checks).every(v=>!v));
 assert.throws(()=>reviewProfile(v,{action:'suspend',reason:'short'},now));
 const suspended=reviewProfile(v,{action:'suspend',reason:'Fixture suspension finding.'},now);assert.equal(suspended.status,'suspended');assert.equal(suspended.verifiedUntil,'');
});
