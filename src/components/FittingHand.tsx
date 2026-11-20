'use client';
import HandClasp from './HandClasp';
import dynamic from 'next/dynamic';
import {Component,useEffect,useState,type ReactNode} from 'react';
import {saveFit,fitFromCamera,loadFit,type HandFit} from '../lib/fitting-hand';
const Scene=dynamic(()=>import('./FittingHandScene'),{ssr:false});
class SceneBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true}}
 render(){return this.state.failed?<p role="status">Hand preview unavailable. Select Piece only to view the jewelry.</p>:this.props.children}
}
export default function FittingHand({category,model,children}:{category:string;model:string;children:ReactNode}){
 const [on,setOn]=useState(false),[tone,setTone]=useState(48),[fit,setFit]=useState<HandFit|null>(null);
 const [colour,setColour]=useState<string>();
 const [curls,setCurls]=useState([0,0,0,0,0]),[digit,setDigit]=useState(-1);
 function pose(amount:number){setCurls(previous=>previous.map((value,i)=>digit===-1||digit===i?amount:value))}
 const watch=category==='watch';
 const wrist=watch||category==='bracelet';
 useEffect(()=>{
   setOn(false);setFit(loadFit(wrist));
   try{setColour(localStorage.getItem('ames-hand-colour')||undefined);const value=localStorage.getItem('ames-hand-tone');if(value!==null)setTone(Math.max(0,Math.min(100,Number(value)||0)))}catch{}
   const refresh=()=>{setFit(loadFit(wrist))};
   window.addEventListener('ames-hand-fit',refresh);return ()=>window.removeEventListener('ames-hand-fit',refresh);
 },[category,wrist]);
 if(!['ring','bracelet','watch'].includes(category)||!model)return <>{children}</>;
 return <div className="flex h-full flex-col"><div className="min-h-0 flex-1">
 {on?<SceneBoundary key={model}><Scene model={model} fit={fit} wrist={wrist} watch={watch} tone={tone} colour={colour} curls={curls}/></SceneBoundary>:children}</div>
 <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 text-xs">
 {on&&<HandClasp onCapture={(points,hex,outline)=>{const captured=fitFromCamera(points,1,0,wrist);if(!captured)return false;captured.outline=outline;saveFit(captured);setFit(loadFit(wrist));setColour(hex);setTone(50);try{localStorage.setItem("ames-hand-colour",hex);localStorage.setItem("ames-hand-tone","50")}catch{}return true}}/>}
 {on&&<><HandClasp onFingers={next=>setCurls(previous=>previous.every((v,i)=>v===next[i])?previous:next)}/><select aria-label="Fingers to move" value={digit} onChange={e=>setDigit(Number(e.target.value))}>{['Whole hand','Thumb','Index finger','Middle finger','Ring finger','Little finger'].map((label,i)=><option key={label} value={i-1}>{label}</option>)}</select>
 <button className="min-h-10 underline" onClick={()=>pose(0)}>Open</button><button className="min-h-10 underline" onClick={()=>pose(1)}>{digit===-1?'Clasp hand':'Bend finger'}</button></>}
 {on&&<label className="flex min-h-10 items-center gap-2">Skin tone<input aria-label="Skin tone" type="range" min="0" max="100" value={tone} onChange={e=>{const n=Number(e.target.value);setTone(n);try{localStorage.setItem('ames-hand-tone',String(n))}catch{}}}/></label>}
 <button className="min-h-10 underline" onClick={()=>setOn(!on)}>{on?'Piece only':'Try on my hand'}</button>
 {on&&fit&&<small>{fit.mm>0?`Camera width · ${fit.mm.toFixed(1)} mm`:fit.outline?'Personal hand shape':'Camera proportions'}</small>}</div></div>;
}
