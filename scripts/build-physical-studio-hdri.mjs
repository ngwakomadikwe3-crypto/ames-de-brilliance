import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {FloatType,Vector3} from 'three';
import {HDRLoader} from 'three/examples/jsm/loaders/HDRLoader.js';
// Photographic HDR studio + narrow emitting softboxes, in linear radiance.
const input=readFileSync('source-assets/environments/studio_small_09_1k.hdr');
const parsed=new HDRLoader().setDataType(FloatType).parse(input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength));
const {width,height,data}=parsed;
const boxes=[[[3,4,5],.14,.45,12], [[-3,1,2],.09,.32,8], [[0,2,-4],.38,.055,16]].map(([direction,w,h,power])=>{
 const normal=new Vector3(...direction).normalize(),right=new Vector3(0,1,0).cross(normal).normalize(),up=normal.clone().cross(right);
 return{normal,right,up,w,h,power};
});
const pixels=Buffer.alloc(width*height*4),direction=new Vector3();
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 const latitude=(.5-(y+.5)/height)*Math.PI,longitude=((x+.5)/width-.5)*Math.PI*2;
 direction.set(Math.cos(latitude)*Math.cos(longitude),Math.sin(latitude),Math.cos(latitude)*Math.sin(longitude));
 let emission=0;
 for(const b of boxes){const forward=direction.dot(b.normal);if(forward<=0)continue;
  const edge=Math.min((b.w-Math.abs(direction.dot(b.right)/forward))/.012,(b.h-Math.abs(direction.dot(b.up)/forward))/.012);
  emission+=b.power*Math.max(0,Math.min(1,edge));
 }
 const offset=(y*width+x)*4,rgb=[0,1,2].map(c=>Math.max(0,data[offset+c]*.28+emission));
 const peak=Math.max(...rgb);if(peak<1e-32)continue;
 const exponent=Math.floor(Math.log2(peak))+1,scale=256/2**exponent;
 for(let c=0;c<3;c++)pixels[offset+c]=Math.min(255,Math.floor(rgb[c]*scale));pixels[offset+3]=exponent+128;
}
const chunks=[Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`)];
for(let y=0;y<height;y++){
 chunks.push(Buffer.from([2,2,width>>8,width&255]));
 for(let c=0;c<4;c++)for(let start=0;start<width;start+=128){const count=Math.min(128,width-start),block=Buffer.alloc(count+1);block[0]=count;
  for(let i=0;i<count;i++)block[i+1]=pixels[(y*width+start+i)*4+c];chunks.push(block);
 }
}
const output=Buffer.concat(chunks),path='public/ames-engine/environments/jewellery-studio-v3.hdr';writeFileSync(path,output);
writeFileSync('public/ames-engine/environments/jewellery-studio-v3.json',JSON.stringify({source:'https://polyhaven.com/a/studio_small_09',author:'Sergej Majboroda',license:'CC0-1.0',sourceSha256:createHash('sha256').update(input).digest('hex'),processing:'Linear photographic fill at 0.28 plus three emitting studio softboxes; no display-space tone mapping',generator:'scripts/build-physical-studio-hdri.mjs',sha256:createHash('sha256').update(output).digest('hex'),width,height},null,2)+'\n');
console.log(path,width,height,output.length);
