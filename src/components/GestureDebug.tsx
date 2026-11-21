'use client';
import type { GestureOutput } from '../lib/gesture-controller';

/** TEMPORARY gesture debug readout (remove once all five gestures pass on a phone; hide with ?gestures=quiet). */
export default function GestureDebug({g}:{g:GestureOutput}){
  const names=['thumb','index','middle','ring','pinky'];
  return <div data-gesture-debug aria-hidden="true" className="pointer-events-none absolute right-2 top-2 z-30 rounded-lg bg-black/80 p-2 text-left font-mono text-[10px] leading-4 text-white" style={{minWidth:150}}>
    <div>state: <b>{g.state}</b></div>
    <div>pose: <b>{g.pose}</b> · held {g.held}</div>
    <div>{names.map((n,i)=><span key={n} style={{marginRight:4,opacity:g.extended[i]?1:.45}}>{n[0].toUpperCase()}{g.extended[i]?'↑':'↓'}</span>)}</div>
    <div>pinch ratio: {g.pinchRatio.toFixed(2)}</div>
    <div>effect: {g.effect}</div>
  </div>;
}

