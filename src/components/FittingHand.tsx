'use client';
import HandClasp from './HandClasp';
import dynamic from 'next/dynamic';
import {Component,useEffect,useRef,useState,type ReactNode} from 'react';
import {saveFit,fitFromCamera,loadFit,type Joint,type HandFit} from '../lib/fitting-hand';
const Scene=dynamic(()=>import('./FittingHandScene'),{ssr:false});
class SceneBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true}}
 render(){return this.state.failed?<p role="status">Hand preview unavailable. Select Piece only to view the jewelry.</p>:this.props.children}
}
export default function FittingHand({category,model,children}:{category:string;model:string;children:ReactNode}){
 const [on,setOn]=useState(false),[tone,setTone]=useState(48),[fit,setFit]=useState<HandFit|null>(null);
 const fittingViewer=useRef<HTMLDivElement>(null);
 const [live,setLive]=useState<Joint[]|null>(null);
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
 return <div className="flex h-full flex-col"><div ref={fittingViewer} className="min-h-0 flex-1">
 {on?<SceneBoundary key={model}><Scene model={model} fit={fit} wrist={wrist} watch={watch} tone={tone} colour={colour} curls={curls} live={live}/></SceneBoundary>:children}</div>
 <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 text-xs">
 {on&&<small>{fit?.outline?.surface?'Your captured hand texture':'Capture your hand to apply your own skin and nail detail. The hand texture is saved on this device.'}</small>}
 {on&&<HandClasp onCapture={(points,hex,outline)=>{const captured=fitFromCamera(points,1,0,wrist);if(!captured)return false;captured.outline=outline;saveFit(captured);setFit(loadFit(wrist));setColour(hex);setTone(50);try{localStorage.setItem("ames-hand-colour",hex);localStorage.setItem("ames-hand-tone","50")}catch{}return true}}/>}
 {on&&<><HandClasp onZoom={factor=>{
   fittingViewer.current?.querySelector('canvas')?.dispatchEvent(new WheelEvent('wheel',{deltaY:-Math.log(factor)*900,bubbles:true,cancelable:true}));
 }} onJoints={points=>setLive(points?fitFromCamera(points,1,0,wrist)?.joints??null:null)}/><select aria-label="Fingers to move" value={digit} onChange={e=>setDigit(Number(e.target.value))}>{['Whole hand','Thumb','Index finger','Middle finger','Ring finger','Little finger'].map((label,i)=><option key={label} value={i-1}>{label}</option>)}</select>
 <button className="min-h-10 underline" onClick={()=>pose(0)}>Open</button><button className="min-h-10 underline" onClick={()=>pose(1)}>{digit===-1?'Clasp hand':'Bend finger'}</button></>}
 {on&&<label className="flex min-h-10 items-center gap-2">Skin tone<input aria-label="Skin tone" type="range" min="0" max="100" value={tone} onChange={e=>{const n=Number(e.target.value);setTone(n);try{localStorage.setItem('ames-hand-tone',String(n))}catch{}}}/></label>}
 <button className="min-h-10 underline" onClick={()=>setOn(!on)}>{on?'Piece only':'Try on my hand'}</button>
 {on&&fit&&<small>{fit.mm>0?`Camera width · ${fit.mm.toFixed(1)} mm`:fit.outline?'Personal hand shape':'Camera proportions'}</small>}</div></div>;
}
