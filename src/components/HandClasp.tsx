"use client";
import {useEffect, useRef, useState} from 'react';
import type {HandLandmarker} from '@mediapipe/tasks-vision';

export default function HandClasp({onPose}:{onPose:(open:boolean)=>void}) {
  const [active,setActive]=useState(false);
  const [message,setMessage]=useState('');
  const preview=useRef<HTMLVideoElement>(null);
  const callback=useRef(onPose);
  useEffect(()=>{callback.current=onPose},[onPose]);
  useEffect(()=>{
    if(!active)return;
    let stopped=false, frame=0, stream:MediaStream|undefined, tracker:HandLandmarker|undefined;
    const video=preview.current;
    if(!video)return;
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
      setMessage('Hold your palm open to open the piece. Make a fist to close it.');
      let candidate:boolean|undefined, emitted:boolean|undefined, since=0, last=0, time=-1;
      function tick(now:number){
        if(stopped)return;
        if(player.readyState>=2 && now-last>=100 && time!==player.currentTime){
          last=now; time=player.currentTime;
          try{
            const hand=tracker!.detectForVideo(player,now).worldLandmarks[0];
            let pose:boolean|undefined;
            if(hand){
              const distance=(a:number,b:number)=>Math.hypot(hand[a].x-hand[b].x,hand[a].y-hand[b].y,hand[a].z-hand[b].z);
              const ratios=[8,12,16,20].map(tip=>distance(tip,0)/Math.max(.001,distance(tip-2,0)));
              if(ratios.every(r=>r>1.13))pose=true;
              if(ratios.every(r=>r<.96))pose=false;
            }
            if(pose!==candidate){candidate=pose;since=now}
            if(pose===undefined)emitted=undefined;
            else if(now-since>=400 && emitted!==pose){emitted=pose;callback.current(pose)}
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
  return <div className="text-center text-xs"><video ref={preview} muted playsInline autoPlay aria-label="Hand gesture camera preview" className={active?"mx-auto mb-1 h-16 w-20 rounded object-cover":"hidden"} /><button type="button" aria-pressed={active} className="ames-pill rounded-full px-3 py-2" onClick={()=>{setMessage(active?'':'Starting camera…');setActive(!active)}}>{active?'Stop hand controls':'Use hand gestures'}</button>{message&&<div role="status">{message}</div>}</div>;
}
