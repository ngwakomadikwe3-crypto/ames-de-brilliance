/** Convert an offline CC0 photographic HDRI to mobile-compatible RGBM cube faces. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { FloatType } from 'three';
const source=path.resolve('source-assets/environments/studio_small_09_1k.hdr');
const output=path.resolve('public/ames-engine/environments/studio-small-09-v1');
const archive=path.resolve('source-assets/environments');
await fs.mkdir(output,{recursive:true});await fs.mkdir(archive,{recursive:true});
const bytes=await fs.readFile(source);await fs.copyFile(source,path.join(output,'studio.hdr'));
const image=new HDRLoader().setDataType(FloatType).parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const size=256,range=64;
const directions=[(u,v)=>[1,-v,-u],(u,v)=>[-1,-v,u],(u,v)=>[u,1,v],(u,v)=>[u,-1,-v],(u,v)=>[u,-v,1],(u,v)=>[-u,-v,-1]];
const names=['px','nx','py','ny','pz','nz'];
const sample=(direction)=>{
 const length=Math.hypot(...direction),[x,y,z]=direction.map(v=>v/length);
 const fx=(Math.atan2(z,x)/(2*Math.PI)+.5)*image.width-.5,fy=Math.acos(Math.max(-1,Math.min(1,y)))/Math.PI*image.height-.5;
 const x0=Math.floor(fx),y0=Math.floor(fy),tx=fx-x0,ty=fy-y0,result=[0,0,0];
 for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
  const xx=((x0+dx)%image.width+image.width)%image.width,yy=Math.max(0,Math.min(image.height-1,y0+dy));
  const weight=(dx?tx:1-tx)*(dy?ty:1-ty),offset=(yy*image.width+xx)*4;
  for(let c=0;c<3;c++)result[c]+=Math.max(0,image.data[offset+c])*weight;
 }
 return result;
};
const srgb=x=>x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055;
for(let face=0;face<6;face++){
 const rgbm=Buffer.alloc(size*size*4),display=Buffer.alloc(size*size*3);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const light=sample(directions[face]((x+.5)/size*2-1,(y+.5)/size*2-1)).map(c=>Math.min(range,c));
  const m=Math.max(1/255,Math.ceil(Math.min(1,Math.max(...light)/range)*255)/255);
  const i=y*size+x;
  for(let c=0;c<3;c++){
   rgbm[i*4+c]=Math.round(Math.max(0,Math.min(1,light[c]/(m*range)))*255);
   display[i*3+c]=Math.round(Math.max(0,Math.min(1,srgb(light[c]/(1+light[c]))))*255);
  }
  rgbm[i*4+3]=Math.round(m*255);
 }
 await sharp(rgbm,{raw:{width:size,height:size,channels:4}}).png({compressionLevel:9}).toFile(path.join(output,names[face]+'-rgbm.png'));
 await sharp(display,{raw:{width:size,height:size,channels:3}}).webp({quality:94,effort:5}).toFile(path.join(output,names[face]+'-display.webp'));
}
const record={title:'Studio Small 09',author:'Sergej Majboroda',source:'https://polyhaven.com/a/studio_small_09',download:'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr',license:'CC0-1.0',licenseUrl:'https://polyhaven.com/license',sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),processor:'scripts/build-mobile-studio-environment.mjs',cubeSize:size,rgbmRange:range,encoding:'Linear RGBM in RGBA8 PNG; display cube is sRGB Reinhard WebP',faces:names};
await fs.writeFile(path.join(output,'source.json'),JSON.stringify(record,null,2)+'\n');
await fs.writeFile(path.join(archive,'studio_small_09-license.json'),JSON.stringify(record,null,2)+'\n');
console.log('Built 6 RGBM HDR faces + 6 display faces from CC0 studio photograph.');
