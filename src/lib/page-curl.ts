type Point = { x: number; y: number };

/** Fold a rectangular sheet across a moving diagonal, using physical pixels. */
export function pageCurlGeometry(width: number, height: number, progress: number, backward = false) {
  const w = Math.max(1, width), h = Math.max(1, height);
  const nx = 0.8, ny = 0.6;
  const d = (nx * w + ny * h) * (1 - Math.max(0, Math.min(1, progress)));
  const rectangle: Point[] = [{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];
  const distance = (p: Point) => p.x * nx + p.y * ny - d;
  const clip = (front: boolean) => {
    const result: Point[] = [];
    for (let i=0;i<rectangle.length;i++) {
      const a=rectangle[i], b=rectangle[(i+1)%rectangle.length];
      const da=distance(a), db=distance(b);
      const insideA=front ? da<=0 : da>=0, insideB=front ? db<=0 : db>=0;
      if(insideA) result.push(a);
      if(insideA!==insideB) { const t=da/(da-db); result.push({x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)}); }
    }
    return result;
  };
  const mirror = (p: Point) => ({x:backward ? w-p.x : p.x,y:p.y});
  const front=clip(true).map(mirror);
  const back=clip(false).map(p=>{const delta=distance(p);return mirror({x:p.x-2*delta*nx,y:p.y-2*delta*ny})});
  const pointString=(points:Point[])=>points.map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const crease=mirror({x:nx*d,y:ny*d});
  const shade=mirror({x:nx*(d-Math.min(w,h)*.28),y:ny*(d-Math.min(w,h)*.28)});
  return {clipPath:`polygon(${front.map(p=>`${p.x/w*100}% ${p.y/h*100}%`).join(',')})`,back:pointString(back),crease,shade};
}
