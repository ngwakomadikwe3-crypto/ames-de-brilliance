"use client";
import {useSyncExternalStore} from 'react';
const snapshot=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const subscribe=(notify:()=>void)=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');media.addEventListener('change',notify);return()=>media.removeEventListener('change',notify);};
export function useReducedMotion(){return useSyncExternalStore(subscribe,snapshot,()=>true);}
