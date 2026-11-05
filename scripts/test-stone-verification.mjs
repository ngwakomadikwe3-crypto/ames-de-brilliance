import { reviewedLicensing } from './fixtures/botswana-licensing.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStoneReview, stoneReviewSchema, publicationBlockers, publicationMatches, publicStoneRecord, reviewChecks, botswanaLicenceBlockers, licenceSchema } from '../src/lib/stone-verification.ts';
const complete=()=>({...emptyStoneReview(),botswanaLicensing:reviewedLicensing(),title:'Natural ruby',species:'ruby',form:'polished',origin:'natural',treatments:'none-reported',carats:1.2,measurements:'6 x 5 x 3 mm',reportStatus:'verified',laboratory:'Example lab',reportNumber:'TEST-001',reportUrl:'https://example.org/report/TEST-001',reportEvidence:'PRIVATE report check 2026-10-24 / DOC-1',tradeScope:'domestic',checks:Object.fromEntries(reviewChecks.map(key=>[key,{checked:true,evidence:'PRIVATE '+key+' DOC-1'}]))});
test('unknown defaults and unchecked evidence cannot publish',()=>{
 assert.ok(publicationBlockers(emptyStoneReview(),true,true).length>=10);
 for(const key of reviewChecks){const r=complete();r.checks[key].evidence='';assert.ok(publicationBlockers(r,true,true).some(s=>s.includes(key)));}
 assert.ok(publicationBlockers(complete(),false,true).length);
 assert.ok(publicationBlockers(complete(),true,false).length);
});
test('disclosures distinguish natural, laboratory grown, treated and simulants',()=>{
 assert.deepEqual(publicationBlockers(complete(),true,true),[]);
 const r=complete();r.origin='laboratory-grown';assert.deepEqual(publicationBlockers(r,true,true),[]);
 r.origin='simulant';assert.ok(publicationBlockers(r,true,true).length);
 r.origin='natural';r.treatments='treated';assert.ok(publicationBlockers(r,true,true).length);r.treatmentDetails='Heat treatment, per report';assert.deepEqual(publicationBlockers(r,true,true),[]);
 assert.equal(stoneReviewSchema.safeParse({...complete(),species:'ring'}).success,false);
});
test('rough natural diamond cross-border evidence applies without mislabelling polished stones',()=>{
 const r={...complete(),species:'diamond',form:'rough',tradeScope:'cross-border'};
 assert.ok(publicationBlockers(r,true,true).some(s=>s.includes('Kimberley')));
 r.kpEvidence='PRIVATE shipment certificate check';assert.deepEqual(publicationBlockers(r,true,true),[]);
 r.form='polished';r.kpEvidence='';assert.deepEqual(publicationBlockers(r,true,true),[]);
});
test('report absence is explicitly disclosed and verification requires evidence',()=>{
 const r=complete();r.reportNumber='';assert.ok(publicationBlockers(r,true,true).length);
 r.reportStatus='not-issued';r.reportEvidence='';assert.ok(publicationBlockers(r,true,true).length);
 r.reportEvidence='No report issued. Physical identification review DOC-2';assert.deepEqual(publicationBlockers(r,true,true),[]);
 assert.equal(publicStoneRecord('stone-1','REF-1',r).reportNumber,'');
 assert.equal(stoneReviewSchema.safeParse({...r,reportUrl:'javascript:alert(1)'}).success,false);
});
test('exact draft/source binding rejects stale receipts, changed sources and withdrawal drafts',()=>{
 const receipt={draftId:'v1',sourceHash:'original'};
 assert.equal(publicationMatches('v1','original','original',receipt),true);
 assert.equal(publicationMatches('v2','original','original',receipt),false);
 assert.equal(publicationMatches('v1','original','edited',receipt),false);
 assert.equal(publicationMatches('v1','original','original',null),false);
});
test('public projection never exposes seller authority, sourcing evidence or private verification references',()=>{
 const publicRecord=publicStoneRecord('stone-1','REF-1',complete());
 assert.equal(publicRecord.stoneId,'stone-1');assert.equal(JSON.stringify(publicRecord).includes('PRIVATE'),false);
 for(const key of ['checks','reportEvidence','kpEvidence','reviewer','sourceHash','botswanaLicensing']) assert.equal(key in publicRecord,false);
});

test('licensing expiry uses Botswana midnight and validates actual dates',()=>{
 const licences=reviewedLicensing();licences.seller.expiresOn='2026-10-24';
 assert.deepEqual(botswanaLicenceBlockers(licences,new Date('2026-10-24T21:59:59Z')),[]);
 assert.ok(botswanaLicenceBlockers(licences,new Date('2026-10-24T22:00:00Z')).some(s=>s.includes('expired')));
 licences.seller.validFrom='2099-01-01';assert.ok(botswanaLicenceBlockers(licences).some(s=>s.includes('not yet valid')));
 licences.seller.verifiedOn='2099-01-01';assert.ok(botswanaLicenceBlockers(licences).some(s=>s.includes('future')));
 for(const value of ['2026-02-30','2026-13-01','bad'])assert.equal(licenceSchema.safeParse({...licences.seller,expiresOn:value}).success,false);
});

test('legacy reviews remain readable but require fresh licensing evidence',()=>{
 const old=complete();delete old.botswanaLicensing;
 const parsed=stoneReviewSchema.parse(old);
 assert.equal(parsed.botswanaLicensing.operator.requirement,'unknown');
 assert.ok(publicationBlockers(parsed,true,true).some(s=>s.includes('operator licensing')));
 assert.ok(publicationBlockers(parsed,true,true).some(s=>s.includes('seller licensing')));
});

test('documented non-applicability requires evidence and scope confirmation for both parties',()=>{
 const licences=reviewedLicensing();
 for(const party of ['operator','seller']){
  licences[party].requirement='not-required';licences[party].number='';licences[party].validFrom='';licences[party].expiresOn='';
 }
 assert.deepEqual(botswanaLicenceBlockers(licences),[]);
 licences.operator.evidence='';licences.seller.scopeConfirmed=false;
 assert.equal(botswanaLicenceBlockers(licences).length,2);
});
