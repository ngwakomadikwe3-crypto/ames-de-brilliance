import {SENSITIVITY} from './view-gesture';
type Point={x:number;y:number;z:number};
export type Pose='None'|'Yaw'|'Tumble'|'Pinch'|'Freeze'|'Reset';
export function fingerPose(p:Point[],pinching:boolean):Pose{
 const dist=(a:number,b:number)=>Math.hypot(p[a].x-p[b].x,p[a].y-p[b].y,p[a].z-p[b].z);
 const span=Math.max(.001,dist(5,17));
 const fingers=[5,9,13,17].map(b=>{
   const length=dist(b,b+1)+dist(b+1,b+2)+dist(b+2,b+3);
   const straight=dist(b,b+3)/Math.max(.001,length), reach=dist(0,b+3)/Math.max(.001,dist(0,b+1));
   return straight>.88&&reach>1.13?'up':straight<.79||reach<1.01?'down':'unknown';
 });
 const key=fingers.join(','),gap=dist(4,8)/span;
 const thumbOut=dist(4,5)/span>.73&&dist(4,17)>dist(3,17)*1.06;
 if(key==='up,up,up,up'&&thumbOut)return 'Freeze';
 if(key==='down,down,down,down'&&!thumbOut&&(!pinching||gap>.34))return 'Reset';
 if(fingers.slice(1).every(x=>x==='down')&&(gap<.33||pinching&&gap<1.20))return 'Pinch';
 if(!thumbOut&&key==='up,down,down,down')return 'Yaw';
 if(!thumbOut&&key==='up,up,down,down'&&dist(8,12)<.68*span)return 'Tumble';
 return 'None';
}
export class FingerControls{
 candidate:Pose='None';mode:Pose='None';frames=0;since=0;last=0;absent=0;cooldown=0;
 frozen=false;fired=false;velocity=0;axis:Pose='None';anchor=0;previous=0;gap=0;moving=false;previousGap=0;
 step(pose:Pose,x:number,y:number,gap:number,aspect:number,now:number){
   const dt=Math.max(.001,Math.min(.08,(now-this.last)/1000));this.last=now;
   const result={state:this.frozen?'Frozen':'Ready',x,y,dx:0,dy:0,zoom:1,progress:0,reset:false,active:false};
   const pos=pose==='Tumble'?y/aspect:x;
   if(this.candidate!==pose){this.candidate=pose;this.frames=0;this.since=now;this.fired=false}
   this.frames++;
   if(pose==='Freeze'){
     this.velocity=0;this.moving=false;
     if(this.frames>=3){this.frozen=true;this.mode='Freeze';result.state='Frozen'}
     return result;
   }
   if(pose==='Reset'){
     this.velocity=0;result.progress=Math.min(1,(now-this.since)/500);result.state='Reset';result.active=true;
     if(this.frames>=3&&result.progress===1&&!this.fired){this.fired=true;this.mode='Reset';result.reset=true}
     return result;
   }
   if(this.mode!==pose&&['Yaw','Tumble','Pinch'].includes(this.mode)){
     this.absent||=now;
     if(now-this.absent>=300){this.cooldown=this.absent+700;this.mode='None';this.absent=0}
   }else this.absent=0;
   if(pose==='None'||pose!==this.mode){
     if(!this.frozen&&this.velocity&&pose!=='Pinch'){
       this.velocity*=Math.exp(-dt*8);if(Math.abs(this.velocity)<.009)this.velocity=0;
       if(this.axis==='Yaw')result.dx=this.velocity*dt;else result.dy=this.velocity*dt;
     }else this.velocity=0;
     if(pose==='None'||this.frames<3||now-this.since<250||((this.absent||now<this.cooldown)&&!(this.frozen&&pose==='Pinch')))return result;
     this.mode=pose;this.absent=0;this.anchor=this.previous=pos;this.gap=this.previousGap=gap;this.velocity=0;this.moving=false;
     if(pose==='Yaw'||pose==='Tumble')this.frozen=false;
   }
   if(pose==='Pinch'){
     result.state='Pinch';result.progress=Math.max(0,Math.min(1,gap));result.active=true;
     const spike=Math.abs(gap-this.previousGap)>Math.max(.12,Math.min(.45,dt*6));this.previousGap=gap;
     if(spike){this.gap=gap;return result}
     const delta=gap-this.gap;if(Math.abs(delta)<.04/SENSITIVITY)return result;
     const limit=Math.log(1.15)*dt,log=Math.max(-limit,Math.min(limit,delta*.30*SENSITIVITY*SENSITIVITY));
     this.gap+=log/SENSITIVITY;result.zoom=Math.exp(log);return result;
   }
   const delta=pos-this.previous;this.previous=pos;result.state=pose;
   if(Math.abs(delta)>Math.max(.045,Math.min(.15,2.5*dt))){this.velocity=0;this.moving=false;this.anchor=pos;return result}
   if(!this.moving&&Math.abs(pos-this.anchor)<.015/SENSITIVITY)return result;
   this.moving=true;this.axis=pose;
   const speed=delta/dt;if(Math.abs(speed)>2.5){this.velocity=0;this.anchor=pos;this.moving=false;return result}
   this.velocity+=(speed-this.velocity)*(.30*SENSITIVITY);
   if(Math.abs(speed)<.008&&Math.abs(this.velocity)<.012){this.moving=false;this.anchor=pos;this.velocity=0}
   result.active=this.moving;
   if(pose==='Yaw')result.dx=this.velocity*dt;else result.dy=this.velocity*dt;
   return result;
 }
}
