'use client';
import {useEffect,useState} from 'react';
type Job={configuration?:string;id:string;title:string;ref:string;metal:string;setting:string};
export default function ManufacturerQuotes(){
  const [jobs,setJobs]=useState<Job[]>([]),[error,setError]=useState('');
  useEffect(()=>{fetch('/api/jeweller/manufacturing',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Manufacturer requests unavailable');setJobs(await r.json())}).catch(e=>setError(e.message))},[]);
  return <section><h2>Manufacturer quotes</h2>{error&&<p role="alert">{error}</p>}{!jobs.length&&!error&&<p>No requests awaiting a quote.</p>}
    {jobs.map(job=><form key={job.id} className="grid gap-2 py-3" onSubmit={async e=>{
      e.preventDefault();const f=new FormData(e.currentTarget);
      try{const r=await fetch('/api/jeweller/manufacturing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:job.id,reference:f.get('reference'),currency:f.get('currency'),amount:Number(f.get('amount'))})});
      if(!r.ok)throw Error((await r.json()).error);setJobs(rows=>rows.filter(x=>x.id!==job.id));setError('')}catch(e){setError(e instanceof Error?e.message:'Quote failed')}
    }}><strong>{job.ref} · {job.title} · {job.metal} {job.setting}</strong>{job.configuration&&<p>{job.configuration}</p>}
    <label>Quote reference <input name="reference" required maxLength={120}/></label><label>Currency <select name="currency">{['BWP','USD','ZAR','EUR','GBP'].map(c=><option key={c}>{c}</option>)}</select></label>
    <label>Manufacturing cost <input name="amount" type="number" min=".01" step=".01" required/></label><button>Submit cost to HOUSEofAMES</button></form>)}</section>
}
