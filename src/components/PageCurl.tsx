"use client";

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { pageCurlGeometry } from '@/lib/page-curl';

type Turn = { from: number; to: number; progress: number; width: number; height: number };

export function usePageCurl(initialPage: number, pageCount: number) {
  const [activePage,setActivePage]=useState(initialPage);
  const [turn,setTurn]=useState<Turn|null>(null);
  const current=useRef(initialPage), frame=useRef(0);
  const drag=useRef<(Turn & { pointerId: number; startX: number; startY: number; moved: boolean }) | null>(null);
  const suppressClick=useRef(false);
  const stop=useCallback(()=>{cancelAnimationFrame(frame.current);drag.current=null;setActivePage(current.current);setTurn(null)},[]);
  useEffect(()=>{
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    window.addEventListener('resize',stop);
    motion.addEventListener('change',stop);
    window.addEventListener('blur',stop);
    return ()=>{cancelAnimationFrame(frame.current);window.removeEventListener('resize',stop);window.removeEventListener('blur',stop);motion.removeEventListener('change',stop)};
  },[stop]);
  const turnTo=useCallback((index:number)=>{
    const next=Math.max(0,Math.min(pageCount-1,index)), from=current.current;
    if(next===from)return;
    drag.current=null;
    cancelAnimationFrame(frame.current);
    current.current=next;setActivePage(next);
    if(document.activeElement?.closest('[data-panel]'))document.querySelector<HTMLButtonElement>(`[data-page-tab="${next}"]`)?.focus({preventScroll:true});
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){setTurn(null);return;}
    const sheet={from,to:next,width:window.innerWidth,height:window.innerHeight};
    const start=performance.now();
    setTurn({...sheet,progress:0});
    const tick=(now:number)=>{
      const t=Math.min(1,(now-start)/900);
      if(t===1){setTurn(null);return;}
      const progress=t*t*(3-2*t);
      setTurn({...sheet,progress});
      frame.current=requestAnimationFrame(tick);
    };
    frame.current=requestAnimationFrame(tick);
  },[pageCount]);
  function finishDrag(event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) {
    const sheet=drag.current;
    if(!sheet || sheet.pointerId!==event.pointerId)return;
    drag.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    if(!sheet.moved)return;
    suppressClick.current=true;
    const commit=!cancelled && sheet.progress>=0.28;
    const destination=commit?sheet.to:sheet.from;
    current.current=destination;
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){setActivePage(destination);setTurn(null);return;}
    const start=performance.now(), from=sheet.progress, to=commit?1:0;
    const tick=(now:number)=>{
      const t=Math.min(1,(now-start)/260), eased=1-(1-t)**3;
      if(t===1){setActivePage(destination);setTurn(null);return;}
      setTurn({...sheet,progress:from+(to-from)*eased});
      frame.current=requestAnimationFrame(tick);
    };
    frame.current=requestAnimationFrame(tick);
  }
  function cornerGesture(direction: -1 | 1) {
    return {
      onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
        if(!event.isPrimary || event.button!==0 || drag.current)return;
        const from=current.current, to=from+direction;
        if(to<0 || to>=pageCount)return;
        stop();suppressClick.current=false;
        drag.current={from,to,progress:0,width:window.innerWidth,height:window.innerHeight,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,moved:false};
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
        const sheet=drag.current;
        if(!sheet || sheet.pointerId!==event.pointerId)return;
        const dx=(sheet.startX-event.clientX)*direction;
        if(!sheet.moved && (dx<8 || dx<Math.abs(event.clientY-sheet.startY)))return;
        sheet.moved=true;
        sheet.progress=Math.max(0,Math.min(0.99,dx/(sheet.width*0.85)));
        if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){setActivePage(sheet.to);setTurn({...sheet});}
      },
      onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>)=>finishDrag(event),
      onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>)=>finishDrag(event,true),
      onLostPointerCapture: (event: ReactPointerEvent<HTMLButtonElement>)=>finishDrag(event,true),
      onClick(event: ReactMouseEvent<HTMLButtonElement>) {
        // A cancelled touch must not consume a subsequent keyboard activation.
        if(suppressClick.current && event.detail!==0){suppressClick.current=false;return;}
        suppressClick.current=false;
        turnTo(current.current+direction);
      },
    };
  }
  return {activePage,turn,turnTo,cornerGesture};
}

export function curlPageStyle(turn:Turn|null,index:number) {
  return turn?.from===index ? {zIndex:2,clipPath:pageCurlGeometry(turn.width,turn.height,turn.progress,turn.to<turn.from).clipPath} : {zIndex:0};
}

export default function PageCurl({turn}:{turn:Turn|null}) {
  const id=useId().replaceAll(':','');
  if(!turn)return null;
  const {back,crease,shade}=pageCurlGeometry(turn.width,turn.height,turn.progress,turn.to<turn.from);
  return <svg className="ames-page-curl" data-page-curl data-curl-progress={turn.progress.toFixed(3)} viewBox={`0 0 ${turn.width} ${turn.height}`} aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-paper`} gradientUnits="userSpaceOnUse" x1={crease.x} y1={crease.y} x2={shade.x} y2={shade.y}>
        <stop offset="0" stopColor="#72998b"/><stop offset=".08" stopColor="#dceee8"/><stop offset=".32" stopColor="#eef5f2"/><stop offset=".72" stopColor="#b8d0c8"/><stop offset="1" stopColor="#9eb8ae"/>
      </linearGradient>
      <filter id={`${id}-shadow`} x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx={turn.to<turn.from?9:-9} dy="10" stdDeviation="12" floodColor="#021410" floodOpacity=".5"/></filter>
    </defs>
    <polygon points={back} fill={`url(#${id}-paper)`} stroke="#dceee8" strokeWidth=".5" filter={`url(#${id}-shadow)`}/>
  </svg>;
}
