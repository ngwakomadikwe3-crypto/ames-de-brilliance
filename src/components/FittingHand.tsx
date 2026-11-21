'use client';
import SavedHandPanel from './SavedHandPanel';
import HandClasp from './HandClasp';
import dynamic from 'next/dynamic';
import {Component,useEffect,useRef,useState,type ReactNode} from 'react';
import {saveHandTone,readSavedHand,fitFromCamera,loadFit,type Joint,type HandFit} from '../lib/fitting-hand';
const ArTryOn=dynamic(()=>import('./ArTryOn'),{ssr:false});
const Scene=dynamic(()=>import('./FittingHandScene'),{ssr:false});
class SceneBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true}}
 render(){return this.state.failed?<p role="status">Hand preview unavailable. Select Piece only to view the jewelry.</p>:this.props.children}
}
export default function FittingHand({category,model,children}:{category:string;model:string;children:ReactNode}){
 const [on,setOn]=useState(false),[tone,setTone]=useState(48),[fit,setFit]=useState<HandFit|null>(null);
 const [scanning,setScanning]=useState(false);
 const fittingViewer=useRef<HTMLDivElement>(null);
 const [cameraView,setCameraView]=useState(true);
 const [live,setLive]=useState<Joint[]|null>(null);
 const [colour,setColour]=useState<string>();
 const [curls,setCurls]=useState([0,0,0,0,0]),[digit,setDigit]=useState(-1);
 function command(detail:{x?:number;y?:number;zoom?:number;reset?:boolean}){fittingViewer.current?.querySelector('canvas')?.dispatchEvent(new CustomEvent('ames:saved-gesture',{detail}))}
 function pose(amount:number){setCurls(previous=>previous.map((value,i)=>digit===-1||digit===i?amount:value))}
 const watch=category==='watch';
 const wrist=watch||category==='bracelet';
 useEffect(()=>{
   setOn(false);
   function refresh(){const saved=readSavedHand();setFit(loadFit(wrist));setTone(saved?.tone??48);setColour(saved?.colour)}
   function deleted(){setCameraView(false);setLive(null);setCurls([0,0,0,0,0]);refresh()}
   function storage(e:StorageEvent){if(e.key==='ames-saved-hand'||!e.key){if(!readSavedHand())deleted();else refresh()}}
   refresh();window.addEventListener('ames-hand-fit',refresh);window.addEventListener('ames-hand-deleted',deleted);window.addEventListener('storage',storage);
   return ()=>{window.removeEventListener('ames-hand-fit',refresh);window.removeEventListener('ames-hand-deleted',deleted);window.removeEventListener('storage',storage)};
 },[category,wrist]);
 if(!['ring','bracelet','watch'].includes(category)||!model)return <>{children}</>;
 return <div className={on?"flex min-h-full flex-col":"flex h-full flex-col"}><div ref={fittingViewer} className="min-h-0 flex-1">
 {on&&scanning?<p role="status" className="p-6 text-center">Hold your hand flat for the scan.</p>:on&&cameraView?<SceneBoundary key={model}><ArTryOn model={model} category={category} fit={fit} onUnavailable={()=>setCameraView(false)}/></SceneBoundary>:on?<SceneBoundary key={model+(fit?":saved":":default")}><Scene model={model} fit={fit} wrist={wrist} watch={watch} tone={tone} colour={colour} curls={curls} live={live}/></SceneBoundary>:children}</div>
 <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 text-xs">
 {on&&!cameraView&&<small>{fit?.outline?.surface?'Your captured hand texture':'Capture your hand to apply your own skin and nail detail. The hand texture is saved on this device.'}</small>}
 {on&&<SavedHandPanel onScanning={setScanning} wrist={wrist}/>}
 {on&&!cameraView&&!scanning&&<><HandClasp onMove={(x,y)=>command({x,y})} onReset={()=>command({reset:true})} onZoom={zoom=>command({zoom})} onJoints={points=>setLive(points?fitFromCamera(points,1,0,wrist)?.joints??null:null)}/><select aria-label="Fingers to move" value={digit} onChange={e=>setDigit(Number(e.target.value))}>{['Whole hand','Thumb','Index finger','Middle finger','Ring finger','Little finger'].map((label,i)=><option key={label} value={i-1}>{label}</option>)}</select>
 <button className="min-h-10 underline" onClick={()=>pose(0)}>Open</button><button className="min-h-10 underline" onClick={()=>pose(1)}>{digit===-1?'Clasp hand':'Bend finger'}</button></>}
 {on&&!cameraView&&<label className="flex min-h-10 items-center gap-2">Skin tone<input aria-label="Skin tone" type="range" min="0" max="100" value={tone} onChange={e=>{const n=Number(e.target.value);setTone(n);try{saveHandTone(n)}catch{}}}/></label>}
 {on&&<button className="min-h-10 underline" onClick={()=>setCameraView(v=>!v)}>{cameraView?'Saved 3D hand':'Live camera hand'}</button>}
 <button className="min-h-10 underline" onClick={()=>setOn(!on)}>{on?'Piece only':'Try on my hand'}</button>
 {on&&!cameraView&&fit&&<small>{fit.mm>0?`Camera width · ${fit.mm.toFixed(1)} mm`:fit.outline?'Personal hand shape':'Camera proportions'}</small>}</div></div>;
}
