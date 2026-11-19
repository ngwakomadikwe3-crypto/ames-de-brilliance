'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
const endpoint='/api/customer/jeweller-updates';
export function FollowJeweller({target}:{target:string}){
 const [following,setFollowing]=useState(false),[signed,setSigned]=useState(false),[busy,setBusy]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let active=true;setBusy(true);fetch(endpoint+'?target='+encodeURIComponent(target),{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();const b=await r.json();if(active){setFollowing(b.following);setSigned(b.signedIn);setError('')}}).catch(()=>{if(active)setError('Follow status unavailable')}).finally(()=>{if(active)setBusy(false)});return()=>{active=false}},[target]);
 async function toggle(){
   setBusy(true);try{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target,action:following?'unfollow':'follow'})});if(!r.ok)throw Error();setFollowing(!following);setError('');window.dispatchEvent(new Event('ames-follow-change'))}catch{setError('Could not update your favourites. Try again.')}finally{setBusy(false)}
 }
 return <div>{!signed&&!busy?<Link href="/app/account" className="underline">Sign in to follow this jeweller</Link>:<button disabled={busy} aria-pressed={following} className="min-h-11 underline" onClick={toggle}>{following?'Following jeweller':'Follow jeweller'}</button>}{error&&<p role="status">{error}</p>}</div>
}
type Drop={id:string;name:string;maker:string;at:string};
export function JewellerUpdates(){
 const [drops,setDrops]=useState<Drop[]>([]),[open,setOpen]=useState(false);
 useEffect(()=>{let alive=true,seq=0;async function refresh(){if(document.hidden)return;const n=++seq;try{const r=await fetch(endpoint,{cache:'no-store'});if(r.ok){const b=await r.json();if(alive&&n===seq)setDrops(b.updates||[])}}catch{}}
 void refresh();const t=setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);window.addEventListener('ames-follow-change',refresh);return()=>{alive=false;clearInterval(t);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('ames-follow-change',refresh)}},[]);
 if(!drops.length)return null;
 return <aside className="fixed bottom-4 right-4 z-[75] max-w-[90vw] rounded-xl bg-[#102a24] p-3 text-white shadow-lg"><button aria-expanded={open} onClick={()=>setOpen(!open)}>New from your jewellers · {drops.length}</button>{open&&<ul className="max-h-52 overflow-auto">{drops.map(d=><li key={d.id}><a className="block py-2 underline" href={'/jewellery/'+d.id} onClick={()=>{void fetch(endpoint,{method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({target:'listing:'+d.id,action:'seen'})})}}>{d.maker} · {d.name}</a></li>)}</ul>}</aside>
}
