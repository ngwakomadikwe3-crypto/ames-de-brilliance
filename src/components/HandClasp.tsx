"use client";
import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {DetectionGate} from '../lib/detection-gate';
import {gestureDebugEnabled} from '../lib/gesture-controller';
import {WandController,hapticTick,type WandOutput} from '../lib/wand-gestures';

import {OneEuroHand} from '../lib/one-euro-hand';
import {trackingAssets} from '../lib/hand-tracking-assets';
import type {HandLandmarker} from '@mediapipe/tasks-vision';

type PixelPoint = {x:number;y:number};
type Outline = {digits:number[]; palm:number; wrist:number; surface?:{image:string; uv:[number,number][]; aspect:number}};

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
  // Keep only hand pixels. The rest of the saved map is the sampled skin colour.
  const atlas=document.createElement('canvas');
  atlas.width=canvas.width; atlas.height=canvas.height;
  const paint=atlas.getContext('2d');
  if(!paint)return null;
  paint.fillStyle=hex; paint.fillRect(0,0,atlas.width,atlas.height);
  paint.save();
  const region=new Path2D();
  const palmLoop=[0,1,2,5,9,13,17];
  palmLoop.forEach((i,n)=>n?region.lineTo(points[i].x,points[i].y):region.moveTo(points[i].x,points[i].y));
  region.closePath();
  for(let d=0;d<5;d++){
    for(let k=0;k<3;k++){
      const a=points[1+d*4+k],b=points[2+d*4+k];
      const angle=Math.atan2(b.y-a.y,b.x-a.x);
      const radius=span*digits[d]*(.45-.045*k);
      const nx=-Math.sin(angle)*radius,ny=Math.cos(angle)*radius;
      const strip=new Path2D();
      strip.moveTo(a.x+nx,a.y+ny);strip.lineTo(b.x+nx,b.y+ny);
      strip.arc(b.x,b.y,radius,angle+Math.PI/2,angle-Math.PI/2,true);
      strip.lineTo(a.x-nx,a.y-ny);strip.closePath();
      // Clip each strip independently so overlaps cannot cancel.
      paint.save();paint.clip(strip);paint.drawImage(canvas,0,0);paint.restore();
    }
  }
  paint.clip(region);paint.drawImage(canvas,0,0);paint.restore();
  const uv=landmarks.map(p=>[p.x,1-p.y] as [number,number]);
  return {hex,outline:{digits,palm,wrist,surface:{image:atlas.toDataURL('image/jpeg',.90),uv,aspect:canvas.width/canvas.height}}};
}

export default function HandClasp({onPose,onMove,onZoom,onFingers,onCapture,onJoints,liveFrame,onUnavailable,onReset,captureLabel,onActivity}:{onActivity?:(active:boolean)=>void;captureLabel?:string;onReset?:()=>void;onUnavailable?:()=>void;liveFrame?:(video:HTMLVideoElement|null,points:{x:number;y:number;z:number}[]|undefined)=>void;onZoom?:(factor:number)=>void;onJoints?:(points:{x:number;y:number;z:number}[]|null)=>void;onCapture?:(points:{x:number;y:number;z:number}[],hex:string,outline:Outline)=>boolean;onFingers?:(values:number[])=>void;onPose?:(open:boolean)=>void;onMove?:(x:number,y:number)=>void}) {
  const reset=useRef(onReset);useEffect(()=>{reset.current=onReset},[onReset]);
  const control=useRef<HTMLDivElement>(null);
  type Feedback={x:number;y:number;label:string;progress:number;active:boolean;debug:WandOutput|null;glint:boolean};
  const [feedback,setFeedback]=useState<Feedback|null>(null);
  const [debugOn]=useState(()=>typeof window!=='undefined'&&gestureDebugEnabled());
  const [guide,setGuide]=useState(false);
  const target=control.current?.closest<HTMLElement>('[data-ames-engine-host],.ames-jewelry-stage');
  const failureRef=useRef(onUnavailable);useEffect(()=>{failureRef.current=onUnavailable},[onUnavailable]);
  const [active,setActive]=useState(!!liveFrame);
  useEffect(()=>{onActivity?.(active);return ()=>onActivity?.(false)},[active,onActivity]);
  useEffect(()=>{
    if(!active||!onReset)return;
    try{if(!localStorage.getItem('ames-view-guide-v2'))setGuide(true)}catch{setGuide(true)}
  },[active,!!onReset]);
  const liveFrameRef=useRef(liveFrame);useEffect(()=>{liveFrameRef.current=liveFrame},[liveFrame]);
  const [message,setMessage]=useState('');
  const joints=useRef(onJoints);
  useEffect(()=>{joints.current=onJoints},[onJoints]);
  const capture=useRef(onCapture);
  useEffect(()=>{capture.current=onCapture},[onCapture]);
  const fingers=useRef(onFingers);
  useEffect(()=>{fingers.current=onFingers},[onFingers]);
  const zoom=useRef(onZoom);
  useEffect(()=>{zoom.current=onZoom},[onZoom]);
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
    let expiry:ReturnType<typeof setTimeout>|undefined;
    const host=control.current?.closest<HTMLElement>('[data-ames-engine-host],.ames-jewelry-stage');
    let seen:boolean|undefined;
    function presence(hand:boolean){
      if(reset.current&&seen!==hand){seen=hand;setMessage(hand?'Hand detected. Point a finger to move the piece.':'Camera ready. Show your whole hand.')}
      if(host && host.dataset.handPresent!==String(hand)){host.dataset.handPresent=String(hand);host.dispatchEvent(new Event('ames:hand-presence'))}}
    function stop(){
      presence(false);
      if(host){delete host.dataset.gestureFrozen;host.dispatchEvent(new Event('ames:showcase-toggle'))}
      clearTimeout(expiry);
      stopped=true;
      setFeedback(null);
      joints.current?.(null);liveFrameRef.current?.(null,undefined);
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach(track=>track.stop());
      if(player.srcObject===stream)player.srcObject=null;
      tracker?.close();
      tracker=undefined;
    }
    function fail(error?:unknown){
      if(stopped)return;
      failureRef.current?.();
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
      const assets=trackingAssets();
      void assets.catch(()=>{}); // Camera permission can take longer than the download.
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:30}},audio:false});
      if(stopped){stop();return}
      player.srcObject=stream;
      await player.play();
      if(stopped)return;
      stage='loading';
      setMessage('Loading hand tracking…');
      const {HandLandmarker,files,bytes}=await assets;
      if(stopped)return;
      tracker=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetBuffer:bytes.slice()},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.60,minTrackingConfidence:.60,minHandPresenceConfidence:.60});
      if(stopped){stop();return}
      stage='tracking';
      setMessage(capture.current?'Show the back of your hand with nails facing the camera. Spread your fingers in even light.':(fingers.current||joints.current)?'Show your hand. Bend or straighten each finger to move the 3D hand.': (callback.current?'Open palm: unclasp. Fist: close. ':'')+'Pinch thumb and index finger, then move your hand to turn the piece. Release to stop.');
      if(zoom.current)setMessage('Point one finger up or down to tilt. Point index and middle left or right to turn. Pinch and spread to zoom.');
      if(liveFrameRef.current)setMessage('Show your hand and wrist against a plain background. Spread a pinch to zoom in.');
      const imageFilter=new OneEuroHand(),worldFilter=new OneEuroHand();
      const viewer=new WandController(),showDebug=gestureDebugEnabled();
      if(reset.current)setMessage('Camera ready. Show your whole hand.');
      const gate=new DetectionGate();


      let openFrames=0,lastLabel='';

      let candidate:boolean|undefined, emitted:boolean|undefined, since=0, last=0, time=-1;
      function schedule(){
        if(stopped)return;
        // The private video has no visible compositor surface. Poll its decoded time.
        frame=requestAnimationFrame(tick);
      }
      function tick(now:number){
        if(stopped)return;
        if(player.readyState>=2 && now>last && time!==player.currentTime){
          last=now; time=player.currentTime;
          try{
            const result=tracker!.detectForVideo(player,now);
            const image=result.landmarks?.[0],world=result.worldLandmarks?.[0];
            const aspect=player.videoWidth/player.videoHeight;
            const raw=world?.length===21?world:image?.length===21?image.map(p=>({x:p.x,y:p.y/aspect,z:p.z,visibility:p.visibility})):undefined;
            presence(!!raw);
            const hand=raw?worldFilter.update(raw,now):undefined;
            const points=image?imageFilter.update(image,now):undefined;
            if(!hand){imageFilter.reset();worldFilter.reset()}
            if(liveFrameRef.current){
              const valid=points?.length===21 && raw?.length===21 && points.every(p=>Number.isFinite(p.x+p.y+p.z)) && Math.hypot((points[5].x-points[17].x)*player.videoWidth,(points[5].y-points[17].y)*player.videoHeight)>=20;
              const state=gate.update(!!valid,now);
              if(state==='track' && points && raw){
                const mirrored=points.map(p=>({x:1-p.x,y:p.y,z:p.z}));
                liveFrameRef.current(player,mirrored);
                clearTimeout(expiry);
                expiry=setTimeout(()=>{liveFrameRef.current?.(null,undefined);},500);
              }else{
                ;
                if(state==='hide')liveFrameRef.current(null,undefined);
              }
            }
            joints.current?.(hand??null);
            let pose:boolean|undefined;
            if(hand && !liveFrameRef.current){
              const distance=(a:number,b:number)=>Math.hypot(hand[a].x-hand[b].x,hand[a].y-hand[b].y,hand[a].z-hand[b].z);
              const ratios=[8,12,16,20].map(tip=>distance(tip,0)/Math.max(.001,distance(tip-2,0)));
              if(capture.current && points){
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
              if(!move.current&&!zoom.current&&!reset.current){
                if(ratios.every(r=>r>1.13))pose=true;
                if(ratios.every(r=>r<.96))pose=false;
            }
            }
            if(hand && points && !capture.current){
              if(points && !capture.current && (move.current||zoom.current||reset.current)){
                // The wand (wand-gestures.ts): orientation-invariant and confidence-gated. The glint sits at the index tip,
                // or between index and middle for the double wand. Mirrored for selfie.
                const event=viewer.step(hand,result.handedness?.[0]?.[0]?.score??1,now);
                const tip=points[8],middle=points[12],pair=event.glint==='pair';
                const x=1-(pair?(tip.x+middle.x)/2:tip.x),y=pair?(tip.y+middle.y)/2:tip.y;
                if(event.lockedIn)hapticTick();
                const frozen=event.frozen;
                if(host && host.dataset.gestureFrozen!==String(frozen)){
                  host.dataset.gestureFrozen=String(frozen);host.dispatchEvent(new Event('ames:showcase-toggle'));
                  if(frozen)host.dispatchEvent(new Event('ames:freeze'));
                }
                const label=event.pose==='wand'?'Levitate':event.pose==='double'?'Sweep':event.pose==='pinch'?'Zoom':event.pose==='palm'?(frozen?'Frozen':'Unfrozen'):event.pose==='fist'?'Reset':frozen?'Frozen':'Ready';
                if(reset.current)setFeedback({x,y,label,progress:event.pose==='fist'?event.resetProgress:0,active:event.active,debug:showDebug?event:null,glint:!!event.glint});
                if(lastLabel!==label){lastLabel=label;setMessage(label==='Ready'?'Hand detected. Hold a gesture briefly.':label==='Levitate'?'Wand · point up or down to tilt':label==='Sweep'?'Double wand · point left or right to turn':label==='Zoom'?'Pinch · spread or close to zoom':label==='Frozen'?'Frozen · open palm again to release':label==='Unfrozen'?'Released':'Resetting…')}
                if(event.reset)reset.current?.();
                if(!liveFrameRef.current&&(event.dx||event.dy))move.current?.(event.dx,event.dy);
                if(event.zoom!==1)zoom.current?.(event.zoom);
              }
            }
            if(!hand){if(reset.current||zoom.current||move.current){
              {const ev=viewer.lost(now);const fz=String(ev.frozen);if(host&&host.dataset.gestureFrozen!==fz&&host.dataset.gestureFrozen!==undefined){host.dataset.gestureFrozen=fz;host.dispatchEvent(new Event('ames:showcase-toggle'))}setFeedback(showDebug?{x:.5,y:.5,label:'',progress:0,active:false,debug:ev,glint:false}:null)}
            }}
            if(!hand){openFrames=0;lastLabel=''}
            if(pose!==candidate){candidate=pose;since=now}
            if(pose===undefined)emitted=undefined;
            else if(now-since>=180 && emitted!==pose){emitted=pose;callback.current?.(pose)}
          }catch{fail();return}
        }
        schedule();
      }
      schedule();
    }
    void start().catch(fail);
    const hide=()=>{if(document.hidden){setActive(false);setMessage('')}};
    document.addEventListener('visibilitychange',hide);
    return ()=>{stop();document.removeEventListener('visibilitychange',hide)};
  },[active]);
  useEffect(()=>{
    if(!target || !onReset)return;
    const canvas=target.querySelector('canvas');if(!canvas)return;
    const previous=canvas.style.filter;
    if(active && feedback?.active)canvas.style.filter='drop-shadow(0 0 3px rgba(232,207,151,.30))';
    return ()=>{canvas.style.filter=previous};
  },[target,active,feedback?.active,!!onReset]);
  return <div ref={control} className="text-center text-xs">{active && target && onReset && createPortal(<>
    {feedback && feedback.label && <div aria-hidden="true" style={{position:'absolute',pointerEvents:'none',zIndex:18,left:`${feedback.x*100}%`,top:`${feedback.y*100}%`,transform:'translate(-50%,-50%)',borderRadius:24,padding:3,background:feedback.label==='Reset'?`conic-gradient(#ffffff ${feedback.progress*360}deg,transparent 0)`:'transparent'}}><span className="block rounded-full bg-black/65 px-2 py-1 text-xs text-white">{feedback.label}</span></div>}
    {debugOn && feedback?.debug && <pre className="pointer-events-none absolute left-2 bottom-2 z-30 rounded bg-black/60 p-2 text-left text-[10px] leading-tight text-white">{`${feedback.debug.state} ${feedback.debug.pose} (${feedback.debug.candidate})\next ${feedback.debug.extended.map(e=>e?1:0).join('')} pinch ${feedback.debug.pinchRatio.toFixed(2)} aim ${feedback.debug.aimDeg.toFixed(0)}°\n${feedback.debug.effect}`}</pre>}
    {feedback?.glint && <div aria-hidden="true" style={{position:'absolute',pointerEvents:'none',zIndex:19,left:`${feedback.x*100}%`,top:`${feedback.y*100}%`,width:12,height:12,transform:'translate(-50%,-50%)',borderRadius:'50%',opacity:.4,mixBlendMode:'plus-lighter',background:'radial-gradient(circle, rgba(255,232,170,1) 0%, rgba(240,196,110,.6) 40%, rgba(240,196,110,0) 70%)'}}/>}
    {feedback?.active && <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{boxShadow:'inset 0 0 26px #ead39c26'}}/>}
    {guide && <div data-gesture-guide className="absolute left-2 top-2 z-30 max-w-56 rounded-xl bg-black/85 p-3 text-left text-xs text-white">Wand: point your index finger up or down and the piece tilts, all the way round; point back at the screen to stop. Double wand: index and middle together, pointed left or right, to turn. Pinch, then spread or close, to zoom. Open palm to freeze (again to release). Hold a fist for half a second to reset.<button type="button" className="block min-h-9 underline" onClick={()=>{setGuide(false);try{localStorage.setItem('ames-view-guide-v2','1')}catch{}}}>Got it</button></div>}
  </>,target)}<button type="button" aria-pressed={active} onPointerEnter={()=>{void trackingAssets().catch(()=>{})}} onFocus={()=>{void trackingAssets().catch(()=>{})}} className="ames-pill rounded-full px-3 py-2" onClick={()=>{setMessage(active?'':'Starting camera…');setActive(!active)}}>{active?'Stop camera':liveFrame?'Start live hand':onCapture?(captureLabel??'Capture my hand'):'Use hand gestures'}</button>{message&&<div role="status">{message}</div>}</div>;
}
