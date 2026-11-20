"use client";
import {useEffect, useRef, useState} from 'react';
import type {HandLandmarker} from '@mediapipe/tasks-vision';

type PixelPoint = {x:number;y:number};
type Outline = {digits:number[]; palm:number; wrist:number};

function sampleAppearance(video:HTMLVideoElement, landmarks:PixelPoint[]) {
  const canvas=document.createElement('canvas');
  canvas.width=Math.min(640,video.videoWidth);
  canvas.height=Math.round(video.videoHeight*canvas.width/video.videoWidth);
  const ctx=canvas.getContext('2d');
  if(!ctx)return null;
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  const points=landmarks.map(p=>({x:p.x*canvas.width,y:p.y*canvas.height}));
  const span=Math.hypot(points[5].x-points[17].x,points[5].y-points[17].y);
  if(span<42)return null;
  const colour=(x:number,y:number)=>{
    const i=4*(Math.round(y)*canvas.width+Math.round(x));
    return [pixels[i],pixels[i+1],pixels[i+2]];
  };
  const median=(values:number[])=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
  function width(a:PixelPoint,b:PixelPoint,t:number,min:number,max:number){
    const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
    const len=Math.hypot(b.x-a.x,b.y-a.y);
    if(len<1)return 0;
    const dx=(b.y-a.y)/len,dy=(a.x-b.x)/len;
    const sample=colour(x,y);
    const sides=[-1,1].map(sign=>{
      let changed=0;
      for(let d=1;d<=span*max;d++){
        const px=x+dx*sign*d,py=y+dy*sign*d;
        if(px<1||py<1||px>=canvas.width-1||py>=canvas.height-1)return 0;
        const rgb=colour(px,py);
        const distance=Math.hypot(...rgb.map((v,i)=>v-sample[i]));
        changed=distance>48?changed+1:0;
        if(changed===3)return d-2>=min*span?d-2:0;
      }
      return 0;
    });
    return sides.every(Boolean)?(sides[0]+sides[1])/span:0;
  }
  const digits=[2,5,9,13,17].map(i=>width(points[i],points[i+1],.64,.035,.26));
  const palm=width(points[0],points[9],.55,.20,1);
  const wrist=width(points[0],points[9],-.09,.15,.85);
  if(!palm||!wrist||digits.some(v=>!v))return null;
  const samples=[5,9,13,17].flatMap(i=>[.45,.65,.8].map(t=>colour(
    points[0].x+(points[i].x-points[0].x)*t,points[0].y+(points[i].y-points[0].y)*t)));
  const hex='#'+[0,1,2].map(i=>median(samples.map(c=>c[i])).toString(16).padStart(2,'0')).join('');
  return {hex,outline:{digits,palm,wrist}};
}

export default function HandClasp({onPose,onMove,onFingers,onCapture}:{onCapture?:(points:{x:number;y:number;z:number}[],hex:string,outline:Outline)=>boolean;onFingers?:(values:number[])=>void;onPose?:(open:boolean)=>void;onMove?:(x:number,y:number)=>void}) {
  const [active,setActive]=useState(false);
  const [message,setMessage]=useState('');
  const capture=useRef(onCapture);
  useEffect(()=>{capture.current=onCapture},[onCapture]);
  const fingers=useRef(onFingers);
  useEffect(()=>{fingers.current=onFingers},[onFingers]);
  const move=useRef(onMove);
  useEffect(()=>{move.current=onMove},[onMove]);
  const callback=useRef(onPose);
  useEffect(()=>{callback.current=onPose},[onPose]);
  useEffect(()=>{
    if(!active)return;
    let stopped=false, frame=0, stream:MediaStream|undefined, tracker:HandLandmarker|undefined;
    const video=document.createElement('video');
    video.disablePictureInPicture=true;
    const player=video;
    let stage='camera';
    video.muted=true;
    video.playsInline=true;
    function stop(){
      stopped=true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach(track=>track.stop());
      if(player.srcObject===stream)player.srcObject=null;
      tracker?.close();
      tracker=undefined;
    }
    function fail(error?:unknown){
      if(stopped)return;
      const name=error instanceof Error?error.name:'';
      if(stage==='camera'){
        const messages:Record<string,string>={
          NotAllowedError:'Camera access is blocked. Allow the camera for HOUSEofAMES in your browser, then try again.',
          NotFoundError:'No camera was found. Connect a camera or open HOUSEofAMES on your phone.',
          NotReadableError:'The camera is busy. Close other camera apps and try again.',
          SecurityError:'Open HOUSEofAMES directly in your browser to allow camera access.',
        };
        setMessage(messages[name]??'Could not start the camera. Open HOUSEofAMES directly in your browser and try again.');
      }else if(stage==='tracking')setMessage('Hand tracking stopped. Tap Use hand gestures to restart.');
      else setMessage('The hand tracker could not load. Check your connection and try again.');
      setActive(false);
    }
    async function start(){
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});
      if(stopped){stop();return}
      player.srcObject=stream;
      await player.play();
      if(stopped)return;
      stage='loading';
      setMessage('Loading hand tracking…');
      const {FilesetResolver,HandLandmarker}=await import('@mediapipe/tasks-vision');
      const files=await FilesetResolver.forVisionTasks('/hand-tracking/wasm');
      if(stopped)return;
      const local=await fetch('/api/hand-model').catch(()=>null);
      if(stopped)return;
      const baseOptions=local?.ok ? {modelAssetBuffer:new Uint8Array(await local.arrayBuffer())} : {modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'};
      if(stopped)return;
      tracker=await HandLandmarker.createFromOptions(files,{baseOptions,runningMode:'VIDEO',numHands:1});
      if(stopped){stop();return}
      stage='tracking';
      setMessage(capture.current?'Hold your hand flat, fingers apart, in even light.':fingers.current?'Show your hand. Bend or straighten each finger to move the 3D hand.': (callback.current?'Open palm: unclasp. Fist: close. ':'')+'Pinch thumb and index finger, then move your hand to turn the piece. Release to stop.');
      let openFrames=0;
      let anchor:{x:number;y:number}|undefined;
      let candidate:boolean|undefined, emitted:boolean|undefined, since=0, last=0, time=-1;
      function tick(now:number){
        if(stopped)return;
        if(player.readyState>=2 && now-last>=100 && time!==player.currentTime){
          last=now; time=player.currentTime;
          try{
            const result=tracker!.detectForVideo(player,now);
            const hand=result.worldLandmarks[0],points=result.landmarks[0];
            let pose:boolean|undefined;
            if(hand){
              const distance=(a:number,b:number)=>Math.hypot(hand[a].x-hand[b].x,hand[a].y-hand[b].y,hand[a].z-hand[b].z);
              const ratios=[8,12,16,20].map(tip=>distance(tip,0)/Math.max(.001,distance(tip-2,0)));
              if(capture.current){
                openFrames=points?.every(p=>p.x>.015&&p.x<.985&&p.y>.015&&p.y<.985)&&ratios.every(r=>r>1.13)?openFrames+1:0;
                if(openFrames>=5){
                  const appearance=sampleAppearance(player,points);
                  if(appearance && capture.current(hand,appearance.hex,appearance.outline)){setMessage('Your hand shape and colour are saved on this device.');setActive(false);return}
                  openFrames=0;
                  setMessage('Move closer. Spread your fingers against a plain, contrasting background and show your wrist.');
                }
              }
              if(fingers.current){
                const curls=[1,5,9,13,17].map(base=>{
                  let bend=0;
                  for(const joint of [base+1,base+2]){
                    const a=distance(joint-1,joint),b=distance(joint,joint+1),c=distance(joint-1,joint+1);
                    if(a*b<1e-9)return 0;
                    bend+=Math.acos(Math.max(-1,Math.min(1,(c*c-a*a-b*b)/(2*a*b))));
                  }
                  return Math.round(10*Math.max(0,Math.min(1,(bend-.15)/(base===1?1.65:2.65))))/10;
                });
                fingers.current(curls);
              }
              const pinch=distance(4,8)/Math.max(.001,distance(5,17));
              const steering=points && pinch<(anchor ? .43 : .30) && ratios.slice(1).some(r=>r>1.05);
              if(steering){
                const x=(points[4].x+points[8].x)/2,y=(points[4].y+points[8].y)/2;
                if(anchor){
                  const dx=anchor.x-x,dy=y-anchor.y;
                  if(Math.hypot(dx,dy)>.004 && Math.hypot(dx,dy)<.22)move.current?.(dx,dy);
                }
                anchor={x,y};
              }else{
                anchor=undefined;
                if(ratios.every(r=>r>1.13))pose=true;
                if(ratios.every(r=>r<.96))pose=false;
              }
            }
            if(!hand){anchor=undefined;openFrames=0};
            if(pose!==candidate){candidate=pose;since=now}
            if(pose===undefined)emitted=undefined;
            else if(now-since>=400 && emitted!==pose){emitted=pose;callback.current?.(pose)}
          }catch{fail();return}
        }
        frame=requestAnimationFrame(tick);
      }
      frame=requestAnimationFrame(tick);
    }
    void start().catch(fail);
    const hide=()=>{if(document.hidden){setActive(false);setMessage('')}};
    document.addEventListener('visibilitychange',hide);
    return ()=>{stop();document.removeEventListener('visibilitychange',hide)};
  },[active]);
  return <div className="text-center text-xs"><button type="button" aria-pressed={active} className="ames-pill rounded-full px-3 py-2" onClick={()=>{setMessage(active?'':'Starting camera…');setActive(!active)}}>{active?'Stop camera':onCapture?'Capture my hand':'Use hand gestures'}</button>{message&&<div role="status">{message}</div>}</div>;
}
