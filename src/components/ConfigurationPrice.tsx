'use client';
import {useEffect,useState} from 'react';
type Price={currency:string;amount:number};
export default function ConfigurationPrice({piece,setting,options}:{piece:string;setting:string;options:string}){
 const [price,setPrice]=useState<Price|null>(null),[staff,setStaff]=useState(false),[status,setStatus]=useState('Checking price…');
 useEffect(()=>{
   const abort=new AbortController();
   fetch('/api/configuration-price?'+new URLSearchParams({piece,setting,options}),{signal:abort.signal,cache:'no-store'})
    .then(async r=>{if(!r.ok)throw Error();const body=await r.json();if(!abort.signal.aborted){setPrice(body.price);setStaff(body.staff);setStatus('Supplier quote required');}})
    .catch(()=>{if(!abort.signal.aborted)setStatus('Price unavailable · request a quote');});
   return ()=>abort.abort();
 },[piece,setting,options]);
 return <section className="my-3 text-sm"><p aria-live="polite">Selected configuration · {price?new Intl.NumberFormat('en-BW',{style:'currency',currency:price.currency}).format(price.amount):status}</p>
 {staff&&<details><summary className="cursor-pointer py-2">Staff pricing for this selection</summary><form className="grid gap-2" onSubmit={async e=>{
 e.preventDefault();const f=new FormData(e.currentTarget);try{
 const quote={currency:f.get('currency'),dealerRef:f.get('dealerRef'),dealerCost:Number(f.get('dealerCost')),makerRef:f.get('makerRef')||'',makerCost:Number(f.get('makerCost')),markup:Number(f.get('markup'))};
 const r=await fetch('/api/configuration-price',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({choice:{piece,setting,options},quote})});const body=await r.json();if(!r.ok)throw Error(body.error);setPrice(body.price);setStatus('Price saved');
 }catch(err){setStatus(err instanceof Error?err.message:'Price update failed');}
 }}><label>Currency <select name="currency">{['BWP','USD','ZAR','EUR','GBP'].map(c=><option key={c}>{c}</option>)}</select></label>
 <label>Dealer quote reference <input required name="dealerRef" maxLength={120}/></label><label>Dealer cost <input required type="number" step=".01" min=".01" name="dealerCost"/></label>
 {setting!=='loose'&&<><label>Manufacturer quote reference <input required name="makerRef" maxLength={120}/></label><label>Manufacturing cost <input required type="number" min=".01" step=".01" name="makerCost"/></label></>}
 <label>Markup (%) <input required name="markup" type="number" min="0" max="1000" step=".01"/></label><button>Publish price for this selection</button><p role="status">{status}</p></form></details>}</section>;
}
