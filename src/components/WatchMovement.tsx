'use client';
import {useEffect,useRef,useState} from 'react';

export default function WatchMovement(){
  const audio=useRef<HTMLAudioElement>(null);
  const [muted,setMuted]=useState(false);
  useEffect(()=>{
    const player=audio.current;
    if(!player)return;
    const panel=player.closest('[data-panel]');
    let timer:ReturnType<typeof setTimeout>|undefined;
    const visible=()=>!muted&&!document.hidden&&panel?.getAttribute('aria-hidden')!=='true';
    function stop(){
      clearTimeout(timer);timer=undefined;player?.pause();
    }
    function schedule(){
      timer=setTimeout(()=>{
        timer=undefined;
        if(!player||!visible())return;
        const minute=new Date().getSeconds()===0;
        player.currentTime=0;player.playbackRate=minute ? .78 : 1;
        player.volume=minute ? .24 : .19;
        void player.play().catch(()=>{});
        schedule();
      },1000-Date.now()%1000);
    }
    function sync(){
      if(!visible())stop();else if(timer===undefined)schedule();
    }
    const observer=new MutationObserver(sync);
    if(panel)observer.observe(panel,{attributes:true,attributeFilter:['aria-hidden']});

    document.addEventListener('visibilitychange',sync);
    document.addEventListener('click',sync);
    window.addEventListener('pagehide',stop);
    window.addEventListener('pageshow',sync);
    sync();
    return ()=>{observer.disconnect();document.removeEventListener('visibilitychange',sync);document.removeEventListener('click',sync);window.removeEventListener('pagehide',stop);window.removeEventListener('pageshow',sync);stop()};
  },[muted]);
  return <><audio ref={audio} preload="auto" src="/watch-movement.wav"/><button type="button" className="min-h-10 text-xs underline" aria-pressed={!muted} onClick={()=>setMuted(!muted)}>{muted?'Enable watch sound':'Mute watch sound'}</button></>;
}
