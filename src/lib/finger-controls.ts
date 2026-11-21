import {SENSITIVITY} from './view-gesture';
type Point={x:number;y:number;z:number};
export type Pose='None'|'Yaw'|'Tumble'|'Pinch'|'Freeze'|'Reset';
export function fingerPose(p:Point[],pinching:boolean):Pose{
 const dist=(a:number,b:number)=>Math.hypot(p[a].x-p[b].x,p[a].y-p[b].y,p[a].z-p[b].z);
 if(p.length!==21||!p.every(v=>Number.isFinite(v.x+v.y+v.z)))return 'None';
 const span=Math.max(.001,dist(5,17));
 // Joint angles distinguish curled fingers even when the palm is tilted.
 function alignment(a:number,b:number,c:number){
   const u=p[a],v=p[b],w=p[c],denom=dist(a,b)*dist(b,c);
   return denom>1e-9?((v.x-u.x)*(w.x-v.x)+(v.y-u.y)*(w.y-v.y)+(v.z-u.z)*(w.z-v.z))/denom:0;
 }
 const fingers=[5,9,13,17].map(b=>{
   const pip=alignment(b,b+1,b+2),dip=alignment(b+1,b+2,b+3);
   const chord=dist(b,b+3)/Math.max(.001,dist(b,b+1)+dist(b+1,b+2)+dist(b+2,b+3));
   if(pip>.55&&dip>.4&&chord>.84)return 'up';
   if(pip<.30||chord<.78)return 'down';
   return 'unknown';
 });
 const key=fingers.join(','),gap=dist(4,8)/span;
 if(key==='up,up,up,up')return 'Freeze';
 const thumbReach=dist(4,5)/span;
 const indexReach=dist(8,0)/Math.max(.001,dist(6,0));
 // A folded index can touch the thumb in both a fist and a pinch.
 const pinchShape=indexReach>.96||thumbReach>.62;
 if(key==='down,down,down,down'&&!pinchShape)return 'Reset';
 if(fingers.slice(1).every(x=>x==='down')&&(gap<.33||pinching&&gap<1.5))return 'Pinch';
 if(key==='down,down,down,down')return 'Reset';
 if(key==='up,down,down,down')return 'Yaw';
 if(key==='up,up,down,down'&&dist(8,12)<.8*span)return 'Tumble';
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
