type Point={x:number;y:number};
type Pixels={width:number;height:number;data:Uint8ClampedArray};
// Detect an isolated, front-facing black square with a light paper margin.
export function markerWidth(frame:Pixels){
  const {width:w,height:h,data}=frame,seen=new Uint8Array(w*h),queue=new Int32Array(w*h);
  const dark=(i:number)=>Math.max(data[4*i],data[4*i+1],data[4*i+2])<75;
  const candidates:number[]=[];
  for(let i=0;i<w*h;i++){
    if(seen[i]||!dark(i))continue;
    let end=1,start=0,x0=w,x1=0,y0=h,y1=0;
    queue[0]=i;seen[i]=1;
    while(start<end){
      const k=queue[start++],x=k%w,y=Math.floor(k/w);
      x0=Math.min(x,x0);x1=Math.max(x,x1);y0=Math.min(y,y0);y1=Math.max(y,y1);
      for(const n of [x>0?k-1:-1,x+1<w?k+1:-1,k-w,k+w]){
        if(n>=0&&n<w*h&&!seen[n]&&dark(n)){seen[n]=1;queue[end++]=n;}
      }
    }
    const dx=x1-x0+1,dy=y1-y0+1;
    if(dx<14||dx>w*.3||Math.abs(dx/dy-1)>.07||end/(dx*dy)<.94||x0<3||x1>w-4||y0<3||y1>h-4)continue;
    const cx=(x0+x1)>>1,cy=(y0+y1)>>1;
    if([cy*w+x0-3,cy*w+x1+3,(y0-3)*w+cx,(y1+3)*w+cx].every(k=>Math.min(data[k*4],data[k*4+1],data[k*4+2])>150))candidates.push((dx+dy)/2);
  }
  return candidates.length===1?candidates[0]:0;
}
export function fingerPose(frame:Pixels,base:Point,joint:Point){
  const {width:w,height:h,data}=frame;
  const dx=(joint.x-base.x)*w,dy=(joint.y-base.y)*h,len=Math.hypot(dx,dy);
  if(len<9)return null;
  const x=base.x*w+dx*.43,y=base.y*h+dy*.43,nx=-dy/len,ny=dx/len;
  const sample=(s:number)=>{
    const px=Math.round(x+nx*s),py=Math.round(y+ny*s);
    if(px<0||px>=w||py<0||py>=h)return null;
    const i=(py*w+px)*4;return [data[i],data[i+1],data[i+2]];
  };
  function edge(sign:number){
    let best=0,score=0;
    for(let i=Math.max(3,Math.round(len*.14));i<=len*.68;i++){
      const a=sample(sign*(i-1)),b=sample(sign*i);if(!a||!b)break;
      const contrast=Math.hypot(...a.map((v,k)=>v-b[k]));
      if(contrast>score){score=contrast;best=i-.5;}
    }
    return score>45?best:0;
  }
  const left=edge(-1),right=edge(1), measured=left>0&&right>0&&Math.max(left,right)/Math.min(left,right)<1.65;
  const offset=measured?(right-left)/2:0;
  return {x:(x+nx*offset)/w,y:(y+ny*offset)/h,width:measured?left+right:len*.56,measured,angle:Math.atan2(dy,dx)*180/Math.PI+90};
}
