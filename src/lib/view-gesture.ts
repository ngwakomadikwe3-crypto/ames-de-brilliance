export const SENSITIVITY:number=.5;
export type PalmInput={x:number;y:number;aspect:number;open:boolean;fist:boolean;curled:boolean;gap:number};
type Mode='Palm'|'Pinch';
export class ViewGesture {
 private previous:PalmInput|null=null;
 private anchor:PalmInput|null=null;
 private still:PalmInput|null=null;
 private candidate:Mode|null=null;
 private mode:Mode|null=null;
 private since=0;private stillAt=0;private absent:number|null=null;private cooldown=0;
 private fistAt:number|null=null;private fired=false;private locked=false;private last=0;
 private x=0;private y=0;private gap=0;
 clear(){Object.assign(this,new ViewGesture())}
 lost(now:number){
   this.previous=this.anchor=this.still=null;this.candidate=null;this.fistAt=null;this.fired=false;this.locked=false;
   if(this.mode){this.absent??=now;if(now-this.absent>=300){this.mode=null;this.cooldown=this.absent+700;this.absent=null}}
 }
 step(p:PalmInput,now:number){
   const result={state:'Ready',progress:0,dx:0,dy:0,zoom:1,reset:false,x:p.x,y:p.y,active:false};
   const dt=Math.max(.001,Math.min(.08,(now-this.last)/1000));this.last=now;
   const gain=Math.min(1,Math.max(.05,SENSITIVITY)),zone=.02/gain,pinchZone=.04/gain;
   const alpha=Math.min(1,.30*gain);
   const distance=(a:PalmInput)=>Math.hypot(p.x-a.x,(p.y-a.y)/p.aspect);
   const pose:Mode|null=p.open?'Palm':p.curled&&!p.fist?'Pinch':null;
   if(this.previous&&(distance(this.previous)>Math.min(.15,Math.max(.045,2.5*dt))||Math.abs(p.gap-this.previous.gap)>Math.min(.45,Math.max(.12,6*dt)))){
     this.previous=p;this.anchor=this.still=null;this.candidate=null;this.stillAt=now;return result;
   }
   this.previous=p;
   if(this.locked){if(this.still&&distance(this.still)<=zone){result.state='Locked';return result}this.locked=false;this.anchor=this.still=null;}
   if(this.mode&&pose!==this.mode){
     this.absent??=now;this.anchor=this.still=null;
     if(now-this.absent>=300){this.mode=null;this.cooldown=this.absent+700;this.absent=null;this.candidate=null}
     return result;
   }
   if(now<this.cooldown)return result;
   if(p.fist){this.fistAt??=now;result.state='Reset';result.progress=Math.min(1,(now-this.fistAt)/500);result.active=true;
     if(result.progress===1&&!this.fired){result.reset=true;this.fired=true}return result}
   this.fistAt=null;this.fired=false;
   if(!pose){this.candidate=null;return result}
   if(!this.mode){
     if(this.candidate!==pose){this.candidate=pose;this.since=now;this.still=p;this.stillAt=now}
     if(now-this.since<250)return result;
     this.mode=pose;this.anchor=null;
   }
   this.absent=null;
   if(!this.anchor){this.anchor=p;this.x=p.x;this.y=p.y;this.gap=p.gap}
   result.state=pose;
   if(pose==='Palm'){
     if(!this.still||distance(this.still)>zone){this.still=p;this.stillAt=now}
     if(now-this.stillAt>=1000){this.locked=true;result.state='Locked';return result}
     if(distance(this.anchor)<zone)return result;
     const dx=(p.x-this.x)*alpha,dy=(p.y-this.y)*alpha;
     if(Math.hypot(dx,dy/p.aspect)>dt*1.4){this.anchor=p;this.x=p.x;this.y=p.y;return result}
     this.x+=dx;this.y+=dy;this.anchor={...p,x:this.x,y:this.y};
     result.dx=-dx*gain;result.dy=dy*gain/p.aspect;result.active=true;
     result.state=Math.abs(result.dx)>Math.abs(result.dy)?(result.dx>0?'←':'→'):(result.dy>0?'↓':'↑');
   }else{
     result.progress=Math.max(0,Math.min(1,p.gap));
     if(Math.abs(p.gap-this.gap)<pinchZone)return result;
     const delta=(p.gap-this.gap)*alpha;
     const limit=Math.log(1.15)*dt;
     const logZoom=Math.max(-limit,Math.min(limit,delta*gain));
     this.gap+=logZoom/gain;result.zoom=Math.exp(logZoom);result.active=true;
   }
   return result;
 }
}
