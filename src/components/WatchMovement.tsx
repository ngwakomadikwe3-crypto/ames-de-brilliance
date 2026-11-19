'use client';
import {useEffect,useRef,useState} from 'react';

export default function WatchMovement(){
  const audio=useRef<HTMLAudioElement>(null);
  const [muted,setMuted]=useState(false);
  useEffect(()=>{
    const player=audio.current;
    if(!player)return;
    const panel=player.closest('[data-panel]');
    player.volume=.27;
    function sync(){
      if(!player)return;
      if(muted || document.hidden || panel?.getAttribute('aria-hidden')==='true')player.pause();
      else if(player.paused)void player.play().catch(()=>{});
    }
    const observer=new MutationObserver(sync);
    if(panel)observer.observe(panel,{attributes:true,attributeFilter:['aria-hidden']});
    const stop=()=>player.pause();
    document.addEventListener('visibilitychange',sync);
    document.addEventListener('click',sync);
    window.addEventListener('pagehide',stop);
    window.addEventListener('pageshow',sync);
    sync();
    return ()=>{observer.disconnect();document.removeEventListener('visibilitychange',sync);document.removeEventListener('click',sync);window.removeEventListener('pagehide',stop);window.removeEventListener('pageshow',sync);stop()};
  },[muted]);
  return <><audio ref={audio} loop preload="none" src="/watch-movement.wav"/><button type="button" className="min-h-10 text-xs underline" aria-pressed={!muted} onClick={()=>setMuted(!muted)}>{muted?'Enable watch sound':'Mute watch sound'}</button></>;
}
