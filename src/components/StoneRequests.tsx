"use client";

import { useEffect, useState } from 'react';

type Pricing={currency:string;dealerRef:string;dealerCost:number;makerRef:string;makerCost:number;markup:number};
type Request = { configuration?:string; makerId?:string;makerName?:string;makerCost?:{amount:number;currency:string;reference:string}; id: string; status: 'requested' | 'contacted' | 'closed'; createdAt: string; version: number; stoneId: string; ref: string; title: string; carats: number;
  setting?:string;metal?:string;supplierQuote?:Pricing;customerPrice?:{amount:number;currency:string};buyerName: string; buyerEmail: string; phone: string; message: string; note: string };
const LABEL = { requested: 'New request', contacted: 'Buyer contacted', closed: 'Closed' };

/** Purchase desk: buyers' requests to buy Catalogue Room stones. Price, KYC and payment are agreed with the buyer directly. */
export default function StoneRequests() {
  const [makers,setMakers]=useState<{id:string;name:string}[]>([]);
  const [rows, setRows] = useState<Request[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true), [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive=true;
    async function refresh(){
      try{
        const response=await fetch('/api/catalogue-requests?staff=1',{cache:'no-store'});
        const body=await response.json();
        if(!response.ok)throw Error(body.error||'Requests unavailable');
        if(alive){setRows(body.requests);setMakers(body.makers||[])}
      }catch(e){if(alive)setError(e instanceof Error?e.message:'Requests unavailable')}
      finally{if(alive)setLoading(false)}
    }
    void refresh();
    const timer=setInterval(refresh,30000);
    return ()=>{alive=false;clearInterval(timer)};
  }, []);
  async function change(r: Request, status: Request['status'], pricing?:Pricing,makerId?:string) {
    setError('');
    try {
      const response = await fetch(`/api/catalogue-requests/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: r.version, status, pricing, makerId,note: notes[r.id] || '' }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Update failed');
      setRows(list => list.map(x => x.id === r.id ? body : x));
    } catch (e) { setError(e instanceof Error ? e.message : 'Update failed'); }
  }
  return <section className="mb-10 space-y-3" data-stone-requests>
    <h2 className="text-lg">Catalogue Room stone requests</h2>
    <p className="text-xs text-white">Buyers asking to buy a catalogue stone. Agree the price, complete KYC and arrange payment with the buyer directly, then record the outcome here.</p>
    {error && <p role="alert" className="text-sm text-red-200">{error}</p>}
    {loading ? <p role="status" className="text-sm">Loading requests…</p> : !rows.length ? <p className="text-sm text-white">No requests yet.</p> :
      <ul className="space-y-3">{rows.map(r => <li key={r.id} className="space-y-2 rounded-2xl border border-white/15 p-4 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><span><span className="font-mono">{r.ref}</span> · {r.title}{r.carats>0?' · '+r.carats+' ct':''}</span><span className="text-xs text-white">{LABEL[r.status]} · {r.createdAt.slice(0, 10)}</span></div>
        <p>{r.buyerName} · <a className="underline" href={`mailto:${r.buyerEmail}?subject=${encodeURIComponent(`Your request for ${r.ref}`)}`}>{r.buyerEmail}</a>{r.phone ? <> · <a className="underline" href={`https://wa.me/${r.phone.replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer">{r.phone}</a></> : null}</p>
        {r.message && <p className="text-white">“{r.configuration} {r.message}”</p>}
        <p>{r.setting||'Loose stone'} {r.metal}</p>
        {r.setting && r.setting!=='loose' && !r.customerPrice && r.status!=='closed' && <label>Manufacturer <select value={r.makerId||''} disabled={!!r.makerCost} onChange={e=>void change(r,r.status,undefined,e.target.value)}><option value="" disabled>Assign a verified studio</option>{makers.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
        {r.makerId && <p>{r.makerCost ? r.makerName+' quoted '+r.makerCost.currency+' '+r.makerCost.amount+' · '+r.makerCost.reference : 'Awaiting quote from '+r.makerName}</p>}
        {r.customerPrice&&<p>Customer quote · {r.customerPrice.currency} {r.customerPrice.amount.toFixed(2)}</p>}
        {r.status!=='closed'&&(!r.makerId||r.makerCost)&&<details><summary className="cursor-pointer py-2">Supplier quotes and retail price</summary>
          <form className="grid gap-3 py-3 sm:grid-cols-2" onSubmit={e=>{
            e.preventDefault();const f=new FormData(e.currentTarget);
            void change(r,r.status,{currency:String(f.get('currency')),dealerRef:String(f.get('dealerRef')),makerRef:String(f.get('makerRef')||''),dealerCost:Number(f.get('dealerCost')),makerCost:Number(f.get('makerCost')||0),markup:Number(f.get('markup'))});
          }}>
          <p className="sm:col-span-2">Enter confirmed costs in one currency. Markup applies to their combined cost.</p>
          <label>Currency<select name="currency" defaultValue={r.makerCost?.currency||r.supplierQuote?.currency||'BWP'} className="field-input">{['BWP','USD','ZAR','EUR','GBP'].map(c=><option key={c}>{c}</option>)}</select></label>
          {([['dealerRef','Dealer and quote reference'],['dealerCost','Confirmed stone cost'],...(r.setting&&r.setting!=='loose'?[['makerRef','Manufacturer and quote reference'],['makerCost','Confirmed manufacturing cost']]:[]),['markup','HOUSEofAMES markup (%)']]).map(([key,label])=><label key={key}>{label}<input className="field-input" name={key} required type={key.endsWith('Ref')?'text':'number'} min={key==='markup'?0:0.01} step=".01" readOnly={!!r.makerCost && key.startsWith('maker')} defaultValue={(key==='makerCost'?r.makerCost?.amount:key==='makerRef'?r.makerCost?.reference:undefined)??r.supplierQuote?.[key as keyof Pricing]}/></label>)}
          <button className="ames-pill min-h-11">Release customer quote</button></form></details>}
        {r.note && <p className="text-xs">Note: {r.note}</p>}
        <label className="block text-xs">Note for the record<input value={notes[r.id] || ''} onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))} maxLength={600} className="mt-1 w-full rounded-xl border border-white/20 bg-[#061d19] px-3 py-2 text-sm" /></label>
        <div className="flex flex-wrap gap-2">{r.status !== 'contacted' && <button className="ames-pill rounded-full border border-white/25 px-3 py-1.5 text-xs" onClick={() => change(r, 'contacted')}>Mark buyer contacted</button>}{r.status !== 'closed' && <button className="ames-pill rounded-full border border-white/25 px-3 py-1.5 text-xs" onClick={() => change(r, 'closed')}>Close</button>}{r.status === 'closed' && <button className="ames-pill rounded-full border border-white/25 px-3 py-1.5 text-xs" onClick={() => change(r, 'requested')}>Reopen</button>}</div>
      </li>)}</ul>}
  </section>;
}
