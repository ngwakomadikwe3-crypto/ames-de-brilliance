export class DetectionGate {
  private count=0;
  private previous=-Infinity;
  private visible=false;
  private lastGood=-Infinity;
  update(good:boolean,time:number):'track'|'hold'|'hide'{
    if(time-this.previous>=500)this.count=0;
    this.previous=time;
    if(time-this.lastGood>=500)this.visible=false;
    if(!good){this.count=0;return this.visible?'hold':'hide'}
    this.count++;
    if(this.count>=3){this.visible=true;this.lastGood=time;return 'track'}
    return this.visible?'hold':'hide';
  }
}
