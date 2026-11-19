"use client";
import {useEffect, useRef, useState} from 'react';
import type {HandLandmarker} from '@mediapipe/tasks-vision';

export default function HandClasp({onPose}:{onPose:(open:boolean)=>void}) {
  const [active,setActive]=useState(false);
  const [message,setMessage]=useState('');
  const callback=useRef(onPose);
  useEffect(()=>{callback.current=onPose},[onPose]);
  useEffect(()=>{
    if(!active)return;
    let stopped=false, frame=0, stream:MediaStream|undefined, tracker:HandLandmarker|undefined;
    const video=document.createElement('video');
    video.muted=true;
    video.playsInline=true;
    function stop(){
      stopped=true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach(track=>track.stop());
      video.srcObject=null;
      tracker?.close();
      tracker=undefined;
    }
    function fail(){
      if(stopped)return;
      setMessage('Hand controls unavailable. Use the clasp button.');
      setActive(false);
    }
    async function start(){
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});
      if(stopped){stop();return}
      video.srcObject=stream;
      await video.play();
      const {FilesetResolver,HandLandmarker}=await import('@mediapipe/tasks-vision');
      const files=await FilesetResolver.forVisionTasks('/hand-tracking/wasm');
      if(stopped)return;
      tracker=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'},runningMode:'VIDEO',numHands:1});
      if(stopped){stop();return}
      setMessage('Hold your palm open to open the piece. Make a fist to close it.');
      let candidate:boolean|undefined, emitted:boolean|undefined, since=0, last=0, time=-1;
      function tick(now:number){
        if(stopped)return;
        if(video.readyState>=2 && now-last>=100 && time!==video.currentTime){
          last=now; time=video.currentTime;
          try{
            const hand=tracker!.detectForVideo(video,now).worldLandmarks[0];
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
  return <div className="text-center text-xs"><button type="button" aria-pressed={active} className="ames-pill rounded-full px-3 py-2" onClick={()=>{setMessage(active?'':'Starting camera…');setActive(!active)}}>{active?'Stop hand controls':'Use hand gestures'}</button>{message&&<div role="status">{message}</div>}</div>;
}
