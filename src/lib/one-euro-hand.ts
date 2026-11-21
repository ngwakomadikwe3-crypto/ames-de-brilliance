export type CameraPoint={x:number;y:number;z:number};
export class OneEuroHand {
  private values:number[]=[];
  private raw:number[]=[];
  private velocity:number[]=[];
  private previous=0;
  reset(){this.raw=[];this.previous=0}
  update(points:CameraPoint[],now:number){
    const input=points.flatMap(p=>[p.x,p.y,p.z]);
    const dt=(now-this.previous)/1000;
    this.previous=now;
    if(!this.raw.length||dt<=0||dt>.22){
      this.raw=input;this.values=input.slice();this.velocity=input.map(()=>0);
    }else{
      const alpha=(hz:number)=>1/(1+1/(2*Math.PI*hz*dt));
      for(let i=0;i<input.length;i++){
        this.velocity[i]+=alpha(1)*((input[i]-this.raw[i])/dt-this.velocity[i]);
        this.values[i]+=alpha(1.8+12*Math.abs(this.velocity[i]))*(input[i]-this.values[i]);
      }
      this.raw=input;
    }
    return points.map((_,i)=>({x:this.values[i*3],y:this.values[i*3+1],z:this.values[i*3+2]}));
  }
}
