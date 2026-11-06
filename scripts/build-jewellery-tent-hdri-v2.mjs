import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
// Jewellery light tent in linear radiance: a bright, even white surround (what
// diamonds and polished platinum mostly see in product photography), crisp
// emitting softboxes for sparkle and fire, dark flags and a lens opening for
// facet contrast, and a dim emerald-tinted floor so reflections sit in the app.
const width=1024,height=512;
const norm=v=>{const l=Math.hypot(...v);return v.map(x=>x/l)};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const smooth=(e0,e1,x)=>{const t=Math.max(0,Math.min(1,(x-e0)/(e1-e0)));return t*t*(3-2*t)};
const box=(direction,w,h,power)=>{const n=norm(direction),right=norm(cross([0,1,0],n)),up=cross(n,right);return{n,right,up,w,h,power}};
const softboxes=[box([3,4,5],.16,.5,22),box([-3,1,2],.1,.34,12),box([0,2,-4],.42,.06,26),box([4,1,-2],.05,.42,16),
  // v2: tall strip lights at the sides draw crisp highlight lines along polished metal.
  box([-5,.6,1.2],.035,.55,18),box([5,.6,-.8],.035,.55,18),box([-1,.4,-5],.03,.5,14)];
const lens=norm([0,.35,1]);
// v2: more and wider flags so metal shows dark edges and diamonds black facet contrast.
const flags=[{lon:100,width:22},{lon:-105,width:20},{lon:25,width:11},{lon:-160,width:16},{lon:-55,width:10},{lon:150,width:9},{lon:60,width:8},{lon:-20,width:6}];
function radiance(d){
  const y=d[1];
  // White tent, slightly brighter overhead; neutral to faintly warm.
  // v2: dimmer sides, bright overhead: light comes from above, the walls stay grey.
  const tent=.26+1.15*Math.max(0,y)**1.4;
  let rgb=[tent,tent*.995,tent*.98];
  // Dim emerald-tinted floor below the horizon.
  const floor=smooth(.02,-.25,y);
  rgb=rgb.map((c,i)=>c*(1-floor)+[.21,.205,.2][i]*floor);
  // Black flags: tall dark cards at the sides give metal edges and facet contrast.
  const lon=Math.atan2(d[2],d[0])*180/Math.PI;
  for(const f of flags){const dl=Math.abs(((lon-f.lon+540)%360)-180);
    const k=smooth(f.width,f.width*.7,dl)*smooth(-.25,-.05,y)*smooth(.9,.7,y);rgb=rgb.map(c=>c*(1-k)+.015*k);}
  // Lens opening behind the camera: the dark table reflection jewellers expect.
  const kl=smooth(Math.cos(12*Math.PI/180),Math.cos(7*Math.PI/180),dot(d,lens));rgb=rgb.map(c=>c*(1-kl)+.03*kl);
  // Emitting softboxes with soft 1% edges.
  let e=0;for(const b of softboxes){const f=dot(d,b.n);if(f<=0)continue;
    const edge=Math.min((b.w-Math.abs(dot(d,b.right)/f))/.012,(b.h-Math.abs(dot(d,b.up)/f))/.012);e+=b.power*Math.max(0,Math.min(1,edge));}
  // Small overhead ring light for sparkle on the crown.
  e+=14*smooth(Math.cos(12*Math.PI/180),Math.cos(9*Math.PI/180),y);
  return rgb.map(c=>c+e);
}
const pixels=Buffer.alloc(width*height*4);let sum=0,dark=0;
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const lat=(.5-(y+.5)/height)*Math.PI,lon=((x+.5)/width-.5)*Math.PI*2;
  const rgb=radiance([Math.cos(lat)*Math.cos(lon),Math.sin(lat),Math.cos(lat)*Math.sin(lon)]);
  const L=(rgb[0]+rgb[1]+rgb[2])/3;sum+=L;if(L<.1)dark++;
  const o=(y*width+x)*4,peak=Math.max(...rgb);if(peak<1e-32)continue;
  const ex=Math.floor(Math.log2(peak))+1,s=256/2**ex;for(let c=0;c<3;c++)pixels[o+c]=Math.min(255,Math.floor(rgb[c]*s));pixels[o+3]=ex+128;
}
const chunks=[Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`)];
for(let y=0;y<height;y++){chunks.push(Buffer.from([2,2,width>>8,width&255]));
  for(let c=0;c<4;c++)for(let st=0;st<width;st+=128){const n=Math.min(128,width-st),b=Buffer.alloc(n+1);b[0]=n;for(let i=0;i<n;i++)b[i+1]=pixels[(y*width+st+i)*4+c];chunks.push(b);}}
const out=Buffer.concat(chunks),path='public/ames-engine/environments/jewellery-tent-v2.hdr';writeFileSync(path,out);
writeFileSync('public/ames-engine/environments/jewellery-tent-v2.json',JSON.stringify({source:'procedural',license:'Original AMES asset',processing:'Graded tent (grey walls, bright overhead), seven emitting softboxes including three strip lights, overhead ring, eight black flags, lens opening, neutral grey floor; linear radiance, no tone mapping',generator:'scripts/build-jewellery-tent-hdri.mjs',sha256:createHash('sha256').update(out).digest('hex'),width,height,meanRadiance:+(sum/width/height).toFixed(3),darkFraction:+(dark/width/height).toFixed(3)},null,2)+'\n');
console.log(path,out.length,'mean',(sum/width/height).toFixed(3),'dark<0.1',(dark/width/height).toFixed(3));
