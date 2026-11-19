'use client';
import Link from 'next/link';
import {useEffect,useRef} from 'react';
import HouseWordmark from './HouseWordmark';
import {useSilk,backgrounds,chooseBackground,type Background} from './SilkPreference';

export default function HouseNavigation({light=false}:{light?:boolean}){
 const silk=useSilk(), menu=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{
   const close=(e:PointerEvent)=>{if(menu.current&&!menu.current.contains(e.target as Node))menu.current.open=false};
   document.addEventListener('pointerdown',close);return ()=>document.removeEventListener('pointerdown',close);
 },[]);
 return <div className="house-navigation"><details ref={menu} onKeyDown={e=>{if(e.key==='Escape'&&menu.current){menu.current.open=false;menu.current.querySelector('summary')?.focus()}}}>
 <summary aria-label="Menu"><span aria-hidden="true">☰</span></summary>
 <nav aria-label="House menu" onClick={e=>{if((e.target as HTMLElement).closest('a')&&menu.current)menu.current.open=false}}>
 {Object.entries({'Boutique & SAME':'/app','My workspace':'/workspace','Profile & settings':'/app/account','Jeweller studio':'/jeweller','My cart':'/cart','Purchases & invoices':'/app/billing'}).map(([name,href])=><Link key={href} href={href}>{name}</Link>)}
 <label>Silk background <select value={silk} onChange={e=>chooseBackground(e.target.value as Background)}>{backgrounds.map(v=><option key={v}>{v}</option>)}</select></label>
 </nav></details><Link href="/app" aria-label="HOUSEofAMES home"><HouseWordmark size={14} tone={silk==='White'||(silk==='Emerald'&&light)?'ink':'light'}/></Link></div>;
}