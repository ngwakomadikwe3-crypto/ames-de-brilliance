"use client";

import { useEffect, useState } from 'react';

import { emptyStoneReview, reviewChecks, type StoneReview } from '@/lib/stone-verification';
import type { LicenceReview } from '@/lib/stone-verification';

type Detail={draft:null|{id:string;createdAt:string;review:StoneReview;actor:string;reason:string};blockers:string[];published:boolean;receipt:null|{actor:string;approvedAt:string}};

async function responseJson(response:Response){const body=await response.json();if(!response.ok)throw new Error(body.error||'Request failed');return body;}

const labels:Record<string,string>={identity:'Stone identity',physicalMatch:'Physical stone matched to evidence',sellerAuthority:'Ownership / authority to sell',provenance:'Supplier and sourcing records',licensing:'Applicable licences / obligations reviewed'};

export default function StoneVerificationTab(){

 const [stones,setStones]=useState<{id:string;ref:string;status:string}[]>([]),[id,setId]=useState('');

 const [error,setError]=useState('');

 useEffect(()=>{const controller=new AbortController();fetch('/api/stones',{signal:controller.signal}).then(responseJson).then(setStones).catch(e=>{if(!controller.signal.aborted)setError(e.message)});return()=>controller.abort()},[]);

 return <div className="max-w-4xl mx-auto p-5 text-[#EAE8E4] space-y-4">

  <h1 className="text-lg">Stone catalogue verification</h1><p className="text-xs text-[#A6A6AB]">Review existing inventory for publication. Only reviewed rough gemstones appear in the Catalogue Room. Inventory availability alone does not approve publication.</p>

  {error&&<p role="alert">{error}</p>}

  <label className="block text-xs">Inventory stone<select className="field-input w-full mt-2" value={id} onChange={e=>setId(e.target.value)}><option value="">Select a stone</option>{stones.map(s=><option key={s.id} value={s.id}>{s.ref} · {s.status}</option>)}</select></label>

  {id&&<ReviewEditor key={id} id={id}/>}

 </div>;

}

function ReviewEditor({id}:{id:string}){

 const [review,setReview]=useState<StoneReview>(emptyStoneReview),[detail,setDetail]=useState<Detail|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[reviewer,setReviewer]=useState(''),[confirmed,setConfirmed]=useState(false),[reason,setReason]=useState('');

 const endpoint=`/api/stone-reviews/${encodeURIComponent(id)}`;

 useEffect(()=>{const controller=new AbortController();fetch(endpoint,{signal:controller.signal}).then(responseJson).then(value=>{setDetail(value);setReview(value.draft?.review||emptyStoneReview())}).catch(e=>{if(!controller.signal.aborted)setError(e.message)});return()=>controller.abort()},[endpoint]);

 function change<K extends keyof StoneReview>(key:K,value:StoneReview[K]){setReview(current=>({...current,[key]:value}));setDirty(true);setConfirmed(false)}

 async function act(action:string){setBusy(true);setError('');try{const value=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,review,reviewer,confirmed,draftId:detail?.draft?.id,reason})}).then(responseJson);setDetail(value);setReview(value.draft.review);setDirty(false);setConfirmed(false)}catch(e){setError(e instanceof Error?e.message:'Review failed')}finally{setBusy(false)}}

 const field=(key:keyof Omit<StoneReview,'checks'|'carats'|'botswanaLicensing'>,label:string)=><label key={key} className="block text-xs">{label}<input className="field-input w-full mt-1" value={review[key]} onChange={e=>change(key,e.target.value as never)} disabled={busy}/></label>;

 const select=(key:'species'|'form'|'origin'|'treatments'|'reportStatus'|'tradeScope',label:string,options:string[])=><label className="text-xs">{label}<select className="field-input w-full mt-1" value={review[key]} onChange={e=>change(key,e.target.value as never)} disabled={busy}>{options.map(value=><option key={value} value={value}>{value.replaceAll('-',' ')}</option>)}</select></label>;

 return <div className="border border-white/15 rounded-lg p-4 space-y-5" data-stone-verification>

  {error&&<p role="alert" className="text-red-300 text-xs">{error}</p>}

  <p role="status" className="text-sm">{detail?.published?'Published in the catalogue':'Not published'}{dirty?' · unsaved edits':''}</p>

  <p className="text-xs text-[#A6A6AB]">Evidence references are private document IDs or locations staff can retrieve. An upload or report number is not proof by itself. No grades are inferred from CAD or photographs.</p>

  <fieldset disabled={busy||!detail} className="grid sm:grid-cols-2 gap-3">

   <legend className="mb-3 text-sm">Identity and public disclosures</legend>

   {field('title','Public stone title')}{select('species','Species',['unknown','diamond','ruby','sapphire','emerald','other-precious-stone'])}{field('otherSpecies','Other gemstone species (for example quartz or tourmaline)')}

   {select('form','Form',['unknown','rough','polished'])}{select('origin','Origin',['unknown','natural','laboratory-grown','simulant'])}

   {select('treatments','Treatment disclosure',['unknown','none-reported','treated'])}{field('treatmentDetails','Treatment details (public)')}

   <label className="text-xs">Measured weight (carats)<input className="field-input w-full mt-1" type="number" min="0" step="any" value={review.carats} onChange={e=>change('carats',Number(e.target.value))}/></label>

   {field('measurements','Measured dimensions, including units')}{field('gradeSummary','Grades exactly as supported by evidence (public; leave blank if ungraded)')}

   {select('reportStatus','Laboratory report status',['unknown','verified','not-issued'])}{field('laboratory','Laboratory')}{field('reportNumber','Report number')}{field('reportUrl','Public laboratory verification URL (HTTPS)')}{field('reportEvidence','Private report-check evidence: date, method, record reference; or reason no report was issued')}

   {select('tradeScope','Intended trade scope',['unknown','domestic','cross-border'])}{field('kpEvidence','Private KP shipment evidence, when applicable to cross-border natural rough diamonds')}

  </fieldset>

  <fieldset disabled={busy||!detail} className="space-y-4"><legend className="mb-3 text-sm">Botswana licensing · private review</legend>
   <p className="text-xs text-[#A6A6AB]">Review the role of AMES and the seller separately, including own-stock sales. Record the authority or legal basis for any finding that no licence is required. This does not grant auction or export permission.</p>
   {(['operator','seller'] as const).map(party => {
    const licence = review.botswanaLicensing[party];
    const update = (key: keyof LicenceReview, value: string | boolean) => change('botswanaLicensing', {...review.botswanaLicensing, [party]: {...licence, [key]: value}});
    return <fieldset key={party} className="grid sm:grid-cols-2 gap-3 border border-white/15 rounded p-3">
     <legend className="px-1 text-sm">{party === 'operator' ? 'AMES operator' : 'Seller / owner of the stone'}</legend>
     <label className="text-xs">Licence requirement<select className="field-input w-full mt-1" value={licence.requirement} onChange={e=>update('requirement',e.target.value)}><option value="unknown">Not assessed</option><option value="required">Required</option><option value="not-required">Not required — documented basis</option></select></label>
     {([['holder','Legal entity / licence holder'],['role','Role in this transaction'],['authority','Issuing authority or legal basis'],['number','Licence number (if required)'],['scope','Permitted activities and stone scope'],['validFrom','Valid from'],['expiresOn','Valid through'],['verifiedOn','Verification date'],['evidence','Private evidence and verification method']] as const).map(([key,label])=><label key={key} className="text-xs">{label}<input type={['validFrom','expiresOn','verifiedOn'].includes(key)?'date':'text'} className="field-input w-full mt-1" value={licence[key]} onChange={e=>update(key,e.target.value)}/></label>)}
     <label className="text-xs flex gap-2 sm:col-span-2"><input type="checkbox" checked={licence.scopeConfirmed} onChange={e=>update('scopeConfirmed',e.target.checked)}/>I checked that this licence or documented legal basis covers this entity, activity, stone and intended trade scope.</label>
    </fieldset>;
   })}
  </fieldset>

  <fieldset disabled={busy||!detail} className="space-y-3"><legend className="mb-3 text-sm">Staff verification</legend>

   {reviewChecks.map(key=><div key={key} className="space-y-1"><label className="text-xs flex gap-2"><input type="checkbox" checked={review.checks[key].checked} onChange={e=>change('checks',{...review.checks,[key]:{...review.checks[key],checked:e.target.checked}})}/>{labels[key]}</label><label className="block text-xs text-[#A6A6AB]">Evidence reference and check details<input className="field-input w-full mt-1" value={review.checks[key].evidence} onChange={e=>change('checks',{...review.checks,[key]:{...review.checks[key],evidence:e.target.value}})}/></label></div>)}

  </fieldset>

  <label className="block text-xs">Responsible reviewer name<input className="field-input w-full mt-1" value={reviewer} onChange={e=>setReviewer(e.target.value)}/></label>

  <button disabled={busy||!detail||reviewer.trim().length<3} onClick={()=>act('save')} className="border border-white/25 px-3 py-2 rounded text-xs disabled:opacity-40">Save new verification draft</button>

  <p className="text-xs text-[#A6A6AB]">Saving a new draft withdraws any previous publication. Any subsequent inventory or seller change also makes the approval stale.</p>

  {!!detail?.blockers.length&&<div className="text-xs"><p>Publication blocked:</p><ul className="list-disc pl-5">{detail.blockers.map(item=><li key={item}>{item}</li>)}</ul></div>}

  <label className="flex gap-2 text-xs"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={dirty||busy}/>I reviewed the saved record and evidence and approve this exact version for the catalogue. This is staff approval, not laboratory certification or legal clearance.</label>

  <div className="flex flex-wrap gap-3"><button disabled={busy||dirty||!confirmed||!detail?.draft||!!detail?.blockers.length||reviewer.trim().length<3} onClick={()=>act('publish')} className="border border-white/25 px-3 py-2 rounded text-xs disabled:opacity-40">Approve and publish catalogue record</button></div>

  {detail?.draft&&<><label className="block text-xs">Withdrawal reason<input value={reason} onChange={e=>setReason(e.target.value)} className="field-input w-full mt-1"/></label><button disabled={busy||!reason.trim()||reviewer.trim().length<3} onClick={()=>act('withdraw')} className="border border-white/25 px-3 py-2 rounded text-xs disabled:opacity-40">Withdraw from catalogue</button><p className="text-xs text-[#A6A6AB]">Latest draft: {detail.draft.createdAt} · {detail.draft.actor} · {detail.draft.reason}</p></>}

  {detail?.receipt&&<p className="text-xs text-[#A6A6AB]">Approval recorded: {detail.receipt.approvedAt} · {detail.receipt.actor}</p>}

 </div>;

}

