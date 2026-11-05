/** Detect a ready-but-blank gem canvas against the known emerald app field. */
import sharp from 'sharp';
const {data,info}=await sharp(process.argv[2]).removeAlpha().raw().toBuffer({resolveWithObject:true});
let foreground=0;const luminance=[];
for(let i=0;i<data.length;i+=info.channels){
 const [r,g,b]=[data[i],data[i+1],data[i+2]];
 if(Math.max(r,g,b)>110||(b>g*1.12&&b>70)||(r>g*1.3&&r>70)){
  foreground++;luminance.push(.2126*r+.7152*g+.0722*b);
 }
}
luminance.sort((a,b)=>a-b);
const result={width:info.width,height:info.height,foregroundPixels:foreground,foregroundFraction:foreground/(info.width*info.height),
 foregroundLumaSpan:foreground?luminance[Math.floor(foreground*.9)]-luminance[Math.floor(foreground*.1)]:0};
console.log(JSON.stringify(result));
if(result.foregroundFraction<.002)process.exitCode=2;
