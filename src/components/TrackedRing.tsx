'use client';
import {useEffect,useState,useRef,type RefObject} from 'react';
import EngineJewelryViewer from './EngineJewelryViewer';
import {fingerPose,markerWidth} from '../lib/ring-camera';
import type {HandLandmarker} from '@mediapipe/tasks-vision';

export default function TrackedRing({video,model}:{video:RefObject<HTMLVideoElement|null>;model:string}){
  const [pose,setPose]=useState<ReturnType<typeof fingerPose>>(null),[diameter,setDiameter]=useState(0),[status,setStatus]=useState('Loading hand tracking…');
  const layer=useRef<HTMLDivElement>(null);
  const [photo,setPhoto]=useState(''),[captureMessage,setCaptureMessage]=useState('');
  useEffect(()=>()=>{if(photo)URL.revokeObjectURL(photo);},[photo]);
  function takePhoto(){
    const v=video.current,gl=layer.current?.querySelector('[data-viewer-state="ready"] canvas');
    if(!pose||!v||!(gl instanceof HTMLCanvasElement)){setCaptureMessage('Wait for the ring to appear, then take the photo.');return;}
    try{
      const out=document.createElement('canvas');out.width=v.videoWidth;out.height=v.videoHeight;
      const ctx=out.getContext('2d');if(!ctx)throw Error();
      ctx.drawImage(v,0,0,out.width,out.height);
      const width=out.width*(pose.width/480)*1.5;
      ctx.translate(out.width*pose.x,out.height*pose.y);ctx.rotate(pose.angle*Math.PI/180);
      ctx.drawImage(gl,-width/2,-width/2,width,width);
      out.toBlob(blob=>{if(blob){setPhoto(URL.createObjectURL(blob));setCaptureMessage('');}else setCaptureMessage('Could not create the photo. Try again.');},'image/jpeg',.94);
    }catch{setCaptureMessage('Could not capture the ring. Please try again.');}
  }
  useEffect(()=>{
    let closed=false,tracker:HandLandmarker|undefined,id=0,last=0,lastVideo=-1;
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
    const history:number[]=[];
    async function start(){
      const {HandLandmarker,FilesetResolver}=await import('@mediapipe/tasks-vision');
      const files=await FilesetResolver.forVisionTasks('/hand-tracking/wasm');
      if(closed)return;
      tracker=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'},runningMode:'VIDEO',numHands:1});
      if(closed){tracker.close();return;}
      function tick(now:number){
        if(closed)return;
        const v=video.current;
        if(v&&ctx&&v.readyState>=2&&now-last>100&&v.currentTime!==lastVideo){
          last=now;lastVideo=v.currentTime;
          const hand=tracker!.detectForVideo(v,now).landmarks[0];
          canvas.width=480;canvas.height=Math.round(480*v.videoHeight/v.videoWidth);
          ctx.drawImage(v,0,0,canvas.width,canvas.height);
          const image=ctx.getImageData(0,0,canvas.width,canvas.height);
          const p=hand?fingerPose(image,hand[13],hand[14]):null;
          setPose(p);
          const scale=p?.measured?markerWidth(image):0;
          const mm=p&&scale?20*p.width/scale:0;
          if(mm>=8&&mm<=35){history.push(mm);if(history.length>9)history.shift();}
          else history.length=0;
          const values=[...history].sort((a,b)=>a-b);
          const stable=values.length>=7&&values[values.length-1]-values[0]<1.2;
          setDiameter(stable?values[Math.floor(values.length/2)]:0);
          setStatus(!p?'Show the back of your hand with your fingers slightly apart.':scale&&!stable?'Hold still for measurement…':'');
        }
        id=requestAnimationFrame(tick);
      }
      setStatus('Show the back of your hand.');id=requestAnimationFrame(tick);
    }
    start().catch(()=>{if(!closed)setStatus('Hand tracking could not load. Check your connection and reopen the camera.');});
    return ()=>{closed=true;cancelAnimationFrame(id);tracker?.close();};
  },[video]);
  return <>{pose && <div ref={layer} data-ring-photo className="pointer-events-none absolute" style={{left:pose.x*100+'%',top:pose.y*100+'%',width:pose.width/480*150+'%',aspectRatio:1,transform:`translate(-50%,-50%) rotate(${pose.angle}deg)`}}><EngineJewelryViewer src={model} alt="Ring on your finger" autoLoad cameraPreset="wearing" opticsProfile="mounted-gem-studio" turntableEnabled={false} style={{width:'100%',height:'100%'}}/></div>}
    {pose && !photo && <button type="button" className="absolute bottom-2 left-1/2 z-20 min-h-11 -translate-x-1/2 rounded-full bg-[#08251f] px-4" onClick={takePhoto}>Take photo</button>}
    {captureMessage && <p role="status" className="absolute inset-x-0 top-0 bg-black/70 p-2">{captureMessage}</p>}
    {photo && <div className="absolute inset-0 z-30 bg-black"><img src={photo} className="h-full w-full object-contain" alt="Your ring try-on photo"/><div className="absolute inset-x-0 bottom-0 flex justify-center gap-4 bg-black/70 p-2"><a className="p-2 underline" href={photo} download="HOUSEofAMES-ring-try-on.jpg">Save photo</a><button type="button" onClick={()=>setPhoto('')}>Retake</button></div></div>}
    {!photo && (status||diameter>0)&&<div role="status" className="absolute inset-x-0 top-0 bg-black/75 p-2 text-center text-xs">{diameter>0?`Estimated finger width: ${diameter.toFixed(1)} mm. Confirm fit with a jeweller.`:status}</div>}</>;
}
