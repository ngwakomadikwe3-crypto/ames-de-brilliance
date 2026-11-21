'use client';
import {useRef,useState} from 'react';
import {Canvas,useThree,useFrame} from '@react-three/fiber';
import {Environment} from '@react-three/drei';
import {ACESFilmicToneMapping,PCFSoftShadowMap,OrthographicCamera} from 'three';
import {HandRig,type RigFrame,type TryFit} from './HandRig';
import HandClasp from './HandClasp';
import type {HandFit} from '../lib/fitting-hand';
import type {CameraPoint} from '../lib/one-euro-hand';

type View={zoom:number;pan:number;targetZoom:number;targetPan:number};
function Redraw({signal,view,layer}:{signal:React.MutableRefObject<()=>void>;view:React.RefObject<View>;layer:React.RefObject<HTMLCanvasElement|null>}){
 const {invalidate,camera,size}=useThree();
 signal.current=invalidate;
 useFrame(()=>{
   const v=view.current;if(!v||!(camera instanceof OrthographicCamera))return;
   v.zoom+=(v.targetZoom-v.zoom)*.3;v.pan+=(v.targetPan-v.pan)*.3;
   camera.zoom=100*v.zoom;camera.position.x=-v.pan*size.width/100;camera.updateProjectionMatrix();
   if(layer.current)layer.current.style.transform=`translateX(${100*v.pan*v.zoom}%) scale(${v.zoom})`;
   if(Math.abs(v.targetZoom-v.zoom)+Math.abs(v.targetPan-v.pan)>.0001)invalidate();
 },-1);
 return null;
}
export default function LiveHand({model,wrist,watch,fit,initialTone,onUnavailable}:{model:string;wrist:boolean;watch:boolean;fit:HandFit|null;initialTone?:string;onUnavailable:()=>void}){
 const canvas=useRef<HTMLCanvasElement>(null),frame=useRef<RigFrame|null>(null),redraw=useRef(()=>{});
 const [clone,setClone]=useState(false),[aspect,setAspect]=useState(4/3);
 const [settings,setSettings]=useState<TryFit>({finger:3,diameter:18,reference:fit&&!wrist&&fit.mm>0?fit.mm:18,wrist:1,clasp:1,size:1,length:1,tone:initialTone??'#9b6754'});
 const view=useRef<View>({zoom:1,pan:0,targetZoom:1,targetPan:0});
 const sampled=useRef(!!initialTone);
 function draw(video:HTMLVideoElement|null,points:CameraPoint[]|undefined){
   const layer=canvas.current,ctx=layer?.getContext('2d',{willReadFrequently:true});
   if(!layer||!ctx)return;
   ctx.clearRect(0,0,layer.width,layer.height);
   if(!video||points?.length!==21||!video.videoWidth){frame.current=null;redraw.current();return}
   const w=video.videoWidth,h=video.videoHeight;
   if(layer.width!==w||layer.height!==h){layer.width=w;layer.height=h;setAspect(w/h)}
   const p=points.map(v=>({x:v.x*w,y:v.y*h}));
   const span=Math.hypot(p[5].x-p[17].x,p[5].y-p[17].y);
   if(span<20)return;
   if(!clone||!sampled.current){
   const mask=new Path2D();
   // Clip the camera image before drawing it into the visible canvas.
   const palm=new Path2D();const loop=[0,1,2,5,9,13,17];
   loop.forEach((i,n)=>n?palm.lineTo(p[i].x,p[i].y):palm.moveTo(p[i].x,p[i].y));palm.closePath();
   function strip(a:{x:number;y:number},b:{x:number;y:number},radius:number){
     const angle=Math.atan2(b.y-a.y,b.x-a.x),nx=-Math.sin(angle)*radius,ny=Math.cos(angle)*radius;
     mask.moveTo(a.x+nx,a.y+ny);mask.lineTo(b.x+nx,b.y+ny);
     mask.arc(b.x,b.y,radius,angle+Math.PI/2,angle-Math.PI/2,true);
     mask.lineTo(a.x-nx,a.y-ny);mask.arc(a.x,a.y,radius,angle-Math.PI/2,angle-3*Math.PI/2,true);mask.closePath();
   }
   for(let digit=0;digit<5;digit++)for(let k=0;k<3;k++){
     const i=1+digit*4+k;strip(p[i],p[i+1],span*[.124,.103,.108,.096,.080][digit]*(1-.095*k));
   }
   const wristEnd={x:p[0].x+(p[0].x-p[9].x)*.32,y:p[0].y+(p[0].y-p[9].y)*.32};
   strip(p[0],wristEnd,span*.32);
   for(const region of [palm,mask]){ctx.save();ctx.clip(region);ctx.translate(w,0);ctx.scale(-1,1);ctx.drawImage(video,0,0,w,h);ctx.restore()}

   if(!sampled.current){
     const centre=p[0],knuckle=p[9],colour=ctx.getImageData((centre.x+knuckle.x)/2,(centre.y+knuckle.y)/2,1,1).data;
     if(colour[3]){sampled.current=true;setSettings(s=>({...s,tone:'#'+Array.from(colour.slice(0,3),v=>v.toString(16).padStart(2,'0')).join('')}))}
   }}
   frame.current={points,aspect:w/h};redraw.current();
 }
 return <div className="flex h-full flex-col">
 <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden" style={{containerType:'size'}}>
 <div className="relative" style={{width:`min(100cqw, ${aspect*100}cqh)`,aspectRatio:aspect}}>
 <canvas ref={canvas} className="block h-full w-full" style={{visibility:clone?'hidden':'visible'}} aria-label="Live hand try-on"/>
 <div className="absolute inset-0">
 <Canvas orthographic camera={{position:[0,0,8],zoom:100,near:.01,far:100}} dpr={[1,1.5]} shadows gl={{alpha:true,antialias:true,toneMapping:ACESFilmicToneMapping}} onCreated={({gl})=>{gl.shadowMap.type=PCFSoftShadowMap}} frameloop="demand">
 <Redraw signal={redraw} view={view} layer={canvas}/><ambientLight intensity={.8}/><directionalLight position={[2,4,5]} intensity={2} castShadow shadow-mapSize-width={512} shadow-mapSize-height={512} shadow-normalBias={.008}/>
 <Environment files="/ames-engine/environments/jewellery-tent-v3.hdr"/>
 <HandRig frame={frame} clone={clone} model={model} wrist={wrist} watch={watch} fit={fit} settings={settings}/></Canvas></div>
 </div></div>
 <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
 <button type="button" aria-pressed={clone} onClick={()=>setClone(!clone)}>{clone?'AR overlay on real hand':'Clone hand'}</button>
 {!wrist&&<label>Finger <select value={settings.finger} onChange={e=>setSettings({...settings,finger:Number(e.target.value)})}>{['Thumb','Index','Middle','Ring','Little'].map((n,i)=><option key={n} value={i}>{n}</option>)}</select></label>}
 <details><summary>Adjust fit</summary>
 {([['size','Hand size',.8,1.2],['length','Finger length',.8,1.2],...(wrist?[['wrist','Wrist width',.8,1.25],['clasp','Clasp fit',.9,1.2]]:[['reference','Measured finger diameter (mm)',12,25],['diameter','Ring inner diameter (mm)',12,25]])] as const).map(([key,label,min,max])=><label key={key} className="block">{label} <input type="range" min={Number(min)} max={Number(max)} step={(key==='diameter'||key==='reference')?.1:.01} value={Number(settings[key as keyof TryFit])} onChange={e=>setSettings({...settings,[key]:Number(e.target.value)})}/> {Number(settings[key as keyof TryFit]).toFixed((key==='diameter'||key==='reference')?1:2)}</label>)}
 <label>Clone skin tone <input type="color" value={settings.tone} onChange={e=>{sampled.current=true;setSettings({...settings,tone:e.target.value})}}/></label></details></div>
 <HandClasp liveFrame={draw} onUnavailable={onUnavailable} onZoom={factor=>{const v=view.current;v.targetZoom=Math.max(.65,Math.min(2,v.targetZoom*factor));redraw.current()}} onMove={dx=>{const v=view.current;v.targetPan=Math.max(-.4,Math.min(.4,v.targetPan+dx));redraw.current()}}/>
 </div>;
}