export type PalmInput={x:number;y:number;aspect:number;open:boolean;fist:boolean;curled:boolean;gap:number};
export class ViewGesture {
  private anchor:PalmInput|null=null;
  private still:PalmInput|null=null;
  private since=0;
  private fistAt:number|null=null;
  private fired=false;
  private locked=false;
  private pinchAt:number|null=null;
  private amount:number|null=null;
  private last=0;
  clear(){this.anchor=this.still=null;this.fistAt=this.pinchAt=this.amount=null;this.fired=this.locked=false;this.last=0}
  step(p:PalmInput,now:number){
    const dt=Math.min(100,Math.max(1,now-this.last));this.last=now;
    const result={state:'Ready',progress:0,dx:0,dy:0,zoom:1,reset:false,x:p.x,y:p.y,active:false};
    const distance=(a:PalmInput)=>Math.hypot(p.x-a.x,(p.y-a.y)/p.aspect);
    if(this.locked){
      if(!this.still||distance(this.still)<=.02){result.state='Locked';return result}
      this.locked=false;this.still=this.anchor=null;
    }
    if(p.open){
      this.fistAt=this.pinchAt=this.amount=null;this.fired=false;
      if(!this.still||distance(this.still)>.02){this.still=p;this.since=now}
      this.anchor??=p;
      if(distance(this.anchor)>.02){
        result.dx=this.anchor.x-p.x;result.dy=(p.y-this.anchor.y)/p.aspect;this.anchor=p;
        result.state=Math.abs(result.dx)>Math.abs(result.dy)?(result.dx>0?'←':'→'):(result.dy>0?'↓':'↑');result.active=true;
      }else result.state='Palm';
      if(now-this.since>=1000){this.locked=true;result.state='Locked';this.anchor=null}
      return result;
    }
    this.anchor=this.still=null;
    if(p.fist){
      this.pinchAt=this.amount=null;this.fistAt??=now;
      result.progress=Math.min(1,(now-this.fistAt)/500);result.state='Reset';result.active=true;
      if(result.progress===1&&!this.fired){result.reset=true;this.fired=true}
      return result;
    }
    this.fistAt=null;this.fired=false;
    if(p.curled){
      this.pinchAt??=now;
      const target=Math.min(1,Math.max(0,(p.gap-.08)/1.05));
      if(now-this.pinchAt>=100){
        const old=this.amount??target;this.amount=old+(target-old)*(1-Math.exp(-dt/75));
        result.zoom=Math.exp((this.amount-old)*Math.log(5));result.state='Pinch';result.progress=this.amount;result.active=true;
      }
    }else{this.pinchAt=this.amount=null}
    return result;
  }
}
