/** Original smooth studio radiance; seamless directional softboxes, no photographed grid. */
import {mkdir,writeFile} from 'node:fs/promises';
import sharp from 'sharp';

const output='public/ames-engine/environments/gemstone-softbox-v2';
await mkdir(output,{recursive:true});
const size=256,range=8;
const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0);
const normalize=a=>a.map(v=>v/Math.hypot(...a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const smooth=(lo,hi,x)=>{const t=Math.max(0,Math.min(1,(x-lo)/(hi-lo)));return t*t*(3-2*t);};
const panels=[
 {direction:[-.8,1.1,1.4],width:.42,height:.72,power:2.0,color:[1,.97,.93]},
 {direction:[1.2,.35,.65],width:.58,height:.72,power:1.2,color:[.92,.97,1]},
 {direction:[-.2,.1,-1],width:.16,height:.85,power:2.5,color:[1,1,1]},
 {direction:[0,1,0],width:.72,height:.62,power:.75,color:[.98,1,1]},
].map(p=>{const normal=normalize(p.direction),right=normalize(cross(Math.abs(normal[1])>.95?[0,0,1]:[0,1,0],normal));return {...p,normal,right,up:cross(normal,right)};});
const sample=direction=>{
 const d=normalize(direction),ambient=.12+.16*(d[1]*.5+.5);
 const light=[ambient*.94,ambient*.98,ambient];
 for(const panel of panels){
  const depth=dot(d,panel.normal);
  if(depth<=0)continue;
  const x=Math.abs(dot(d,panel.right)/depth)/panel.width,y=Math.abs(dot(d,panel.up)/depth)/panel.height;
  const weight=(1-smooth(.72,1,x))*(1-smooth(.78,1,y));
  for(let c=0;c<3;c++)light[c]+=panel.power*panel.color[c]*weight;
 }
 return light;
};
const srgb=x=>x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055;
const directions=[(u,v)=>[1,-v,-u],(u,v)=>[-1,-v,u],(u,v)=>[u,1,v],(u,v)=>[u,-1,-v],(u,v)=>[u,-v,1],(u,v)=>[-u,-v,-1]];
const faces=['px','nx','py','ny','pz','nz'];
let clipped=0,peak=0;
for(let face=0;face<6;face++){
 const radiance=Buffer.alloc(size*size*4),display=Buffer.alloc(size*size*3);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const values=sample(directions[face]((x+.5)/size*2-1,(y+.5)/size*2-1)),i=y*size+x;
  for(let c=0;c<3;c++){
   peak=Math.max(peak,values[c]);if(values[c]>range)clipped++;
   // Fixed range and hardware sRGB decoding keep filtering in linear radiance.
   radiance[i*4+c]=Math.round(srgb(Math.min(1,values[c]/range))*255);
   display[i*3+c]=Math.round(srgb(values[c]/(1+values[c]))*255);
  }
  radiance[i*4+3]=255;
 }
 await sharp(radiance,{raw:{width:size,height:size,channels:4}}).png().toFile(`${output}/${faces[face]}-radiance.png`);
 await sharp(display,{raw:{width:size,height:size,channels:3}}).webp({quality:96}).toFile(`${output}/${faces[face]}-display.webp`);
}
const record={schemaVersion:'ames.environment/2',origin:'Original analytic studio softbox radiance',generator:'scripts/build-gemstone-softbox-environment.mjs',license:'AMES original',cubeSize:size,range,encoding:'sRGB encoded fixed-range linear radiance; opaque RGBA8; hardware decode before filtering',floatingPointTextures:false,panels,peakRadiance:peak,clippedChannels:clipped,faces};
await writeFile(`${output}/source.json`,JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({output,cubeSize:size,range,peakRadiance:peak,clippedChannels:clipped}));
