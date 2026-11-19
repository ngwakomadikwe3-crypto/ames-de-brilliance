'use client';
import {useEffect,useState,type RefObject} from 'react';
import EngineJewelryViewer from './EngineJewelryViewer';
import {fingerPose,markerWidth} from '../lib/ring-camera';
import type {HandLandmarker} from '@mediapipe/tasks-vision';

export default function TrackedRing({video,model,measure}:{video:RefObject<HTMLVideoElement|null>;model:string;measure:boolean}){
  const [pose,setPose]=useState<ReturnType<typeof fingerPose>>(null),[diameter,setDiameter]=useState(0),[status,setStatus]=useState('Loading hand tracking…');
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
          const scale=p?.measured&&measure?markerWidth(image):0;
          const mm=p&&scale?20*p.width/scale:0;
          if(mm>=8&&mm<=35){history.push(mm);if(history.length>9)history.shift();}
          else history.length=0;
          const values=[...history].sort((a,b)=>a-b);
          const stable=values.length>=7&&values[values.length-1]-values[0]<1.2;
          setDiameter(stable?values[Math.floor(values.length/2)]:0);
          setStatus(!p?'Show the back of your hand with your fingers slightly apart.':measure&&!scale?'Keep the 20 mm square upright beside your ring finger, at the same height.':measure&&!stable?'Hold still for measurement…':'');
        }
        id=requestAnimationFrame(tick);
      }
      setStatus('Show the back of your hand.');id=requestAnimationFrame(tick);
    }
    start().catch(()=>{if(!closed)setStatus('Hand tracking could not load. Check your connection and reopen the camera.');});
    return ()=>{closed=true;cancelAnimationFrame(id);tracker?.close();};
  },[video,measure]);
  return <>{pose && <div className="pointer-events-none absolute" style={{left:pose.x*100+'%',top:pose.y*100+'%',width:pose.width/480*150+'%',aspectRatio:1,transform:`translate(-50%,-50%) rotate(${pose.angle}deg)`}}><EngineJewelryViewer src={model} alt="Ring on your finger" autoLoad cameraPreset="front" opticsProfile="mounted-gem-studio" turntableEnabled={false} style={{width:'100%',height:'100%'}}/></div>}
    {(status||diameter>0)&&<div role="status" className="absolute inset-x-0 bottom-0 bg-black/75 p-2 text-center text-xs">{diameter>0?`Estimated finger width: ${diameter.toFixed(1)} mm. Confirm fit with a jeweller.`:status}</div>}</>;
}
