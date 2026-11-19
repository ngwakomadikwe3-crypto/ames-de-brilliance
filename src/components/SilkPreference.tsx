'use client';
import {useSyncExternalStore,useEffect} from 'react';
export const backgrounds=['Emerald','Burgundy','White','Dark'] as const;
export type Background=typeof backgrounds[number];
const key='ames-silk-colour';
let fallback:Background='Emerald';
function read():Background{
  try{const value=localStorage.getItem(key);return backgrounds.includes(value as Background)?value as Background:fallback}catch{return fallback}
}
function subscribe(update:()=>void){
  window.addEventListener('storage',update);window.addEventListener(key,update);
  return ()=>{window.removeEventListener('storage',update);window.removeEventListener(key,update)};
}
export function useSilk(){return useSyncExternalStore(subscribe,read,()=>'Emerald' as Background)}
export function chooseBackground(value:Background){
  fallback=value;try{localStorage.setItem(key,value)}catch{}
  window.dispatchEvent(new Event(key));
}
export function SilkRoot(){
  const value=useSilk();
  useEffect(()=>{document.documentElement.dataset.silk=value.toLowerCase()},[value]);
  return null;
}
