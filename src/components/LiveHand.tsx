'use client';
import {useMemo,useRef,useState} from 'react';
import {Canvas} from '@react-three/fiber';
import {Environment,useGLTF} from '@react-three/drei';
import {Box3,Vector3} from 'three';
import HandClasp from './HandClasp';

type Point={x:number;y:number;z:number};
function Piece({model,watch}:{model:string;watch:boolean}){
 const {scene}=useGLTF(model);
 const shape=useMemo(()=>{
   const copy=scene.clone(true),bounds=new Box3().setFromObject(copy),size=bounds.getSize(new Vector3());
   copy.position.sub(bounds.getCenter(new Vector3()));
   const scale=1.72/Math.max(size.x,size.y,size.z,.001);
   const tilt=watch?0:size.y<=size.z?.45:1.12;
   return <group scale={scale} rotation={[tilt,0,0]}><primitive object={copy}/></group>;
 },[scene,watch]);
 return shape;
}
export default function LiveHand({model,wrist,watch}:{model:string;wrist:boolean;watch:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null),mount=useRef<HTMLDivElement>(null);
 const [aspect,setAspect]=useState(4/3),[zoom,setZoom]=useState(1);
 function draw(video:HTMLVideoElement|null,points:Point[]|undefined){
   const layer=canvas.current,holder=mount.current,ctx=layer?.getContext('2d');
   if(!layer||!ctx||!holder)return;
   ctx.clearRect(0,0,layer.width,layer.height);holder.style.visibility='hidden';
   if(!video||points?.length!==21||!video.videoWidth)return;
   const w=video.videoWidth,h=video.videoHeight;
   if(layer.width!==w||layer.height!==h){layer.width=w;layer.height=h;setAspect(w/h)}
   const p=points.map(v=>({x:v.x*w,y:v.y*h}));
   const span=Math.hypot(p[5].x-p[17].x,p[5].y-p[17].y);
   if(span<20)return;
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
   for(const region of [palm,mask]){ctx.save();ctx.clip(region);ctx.drawImage(video,0,0,w,h);ctx.restore()}
   const a=wrist?p[0]:p[13],b=wrist?wristEnd:p[14],t=wrist?.4:.35;
   const width=span*(wrist?1.04:.29);
   holder.style.left=(100*(a.x+(b.x-a.x)*t)/w)+'%';
   holder.style.top=(100*(a.y+(b.y-a.y)*t)/h)+'%';
   holder.style.width=(100*width/w)+'%';
   holder.style.transform='translate(-50%,-50%) rotate('+(Math.atan2(b.y-a.y,b.x-a.x)+(wrist?-1:1)*Math.PI/2)+'rad)';
   holder.style.visibility='visible';
 }
 return <div className="flex h-full flex-col">
 <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden" style={{containerType:'size'}}>
 <div className="relative" style={{width:`min(100cqw, ${aspect*100}cqh)`,aspectRatio:aspect,transform:`scale(${zoom})`}}>
 <canvas ref={canvas} className="block h-full w-full" aria-label="Live hand try-on"/>
 <div ref={mount} className="pointer-events-none absolute" style={{aspectRatio:1,visibility:'hidden'}}>
 <Canvas camera={{position:[0,0,3],fov:38}} frameloop="demand" resize={{debounce:0}}>
 <ambientLight intensity={.8}/><directionalLight position={[2,4,4]} intensity={2}/><Environment files="/ames-engine/environments/jewellery-tent-v3.hdr"/><Piece model={model} watch={watch}/></Canvas></div>
 </div></div>
 <HandClasp liveFrame={draw} onZoom={factor=>setZoom(z=>Math.max(.65,Math.min(2,z*factor)))}/>
 </div>;
}