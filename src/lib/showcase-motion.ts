export const AUTO_ROTATE=true;
export function showcaseMotion(host:HTMLElement,step:(yaw:number,pitch:number,roll:number)=>void){
 let raf=0,timer=0,last=0,elapsed=Number(host.dataset.showcaseTime)||0,start=0,quietUntil=0,hand=host.dataset.handPresent==='true',down=false;
 const media=matchMedia('(prefers-reduced-motion: reduce)');
 const stop=()=>{cancelAnimationFrame(raf);clearTimeout(timer);last=0;start=0};
 const schedule=()=>{
   stop();if(!AUTO_ROTATE||document.hidden||media.matches||down||hand||(host.dataset.showcasePaused==='true'||host.dataset.gestureFrozen==='true'))return;
   const wait=quietUntil-performance.now();
   if(wait>0){timer=window.setTimeout(schedule,wait+1);return}
   raf=requestAnimationFrame(tick);
 };
 const tick=(now:number)=>{
   if(!start)start=now;
   const dt=last?Math.min(.05,(now-last)/1000):0;last=now;
   const blend=Math.min(1,(now-start)/1000);
   const old=elapsed;elapsed+=dt*blend*blend*(3-2*blend);
   const phase=(t:number)=>t*Math.PI/6+.09*Math.sin(t*Math.PI/6);
   const pitch=(t:number)=>Math.PI/6*Math.sin(2*Math.PI*t/20.37);
   const roll=(t:number)=>Math.PI/36*Math.sin(2*Math.PI*t/29.3);
   step(phase(elapsed)-phase(old),pitch(elapsed)-pitch(old),roll(elapsed)-roll(old));raf=requestAnimationFrame(tick);
 };
 const delay=()=>{quietUntil=performance.now()+5000;schedule()};
 const press=()=>{down=true;delay()};const release=()=>{if(down){down=false;delay()}};
 const presence=()=>{hand=host.dataset.handPresent==='true';delay()};
 const visibility=()=>{if(document.hidden)stop();else delay()};
 host.addEventListener('pointerdown',press,true);window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);window.addEventListener('blur',release);
 host.addEventListener('wheel',delay,{passive:true,capture:true});host.addEventListener('ames:hand-presence',presence);host.addEventListener('ames:showcase-toggle',schedule);
 document.addEventListener('visibilitychange',visibility);media.addEventListener('change',schedule);
 quietUntil=Math.max(0,Number(host.dataset.showcaseResume)||0);schedule();
 return ()=>{host.dataset.showcaseTime=String(elapsed);host.dataset.showcaseResume=String(Math.max(quietUntil,performance.now()+5000));stop();host.removeEventListener('pointerdown',press,true);window.removeEventListener('pointerup',release);window.removeEventListener('pointercancel',release);window.removeEventListener('blur',release);host.removeEventListener('wheel',delay,true);host.removeEventListener('ames:hand-presence',presence);host.removeEventListener('ames:showcase-toggle',schedule);document.removeEventListener('visibilitychange',visibility);media.removeEventListener('change',schedule)};
}
