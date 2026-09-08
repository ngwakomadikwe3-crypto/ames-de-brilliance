// Public media paths must never accidentally publish a GLB or arbitrary active content.
export function publicUploadName(name,bytes,kind='image'){
 const b=Buffer.from(bytes),ascii=(start,end)=>b.toString('ascii',start,end);let extension;
 if(kind==='image'){
  if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))extension='png';
  else if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)extension='jpg';
  else if(['GIF87a','GIF89a'].includes(ascii(0,6)))extension='gif';
  else if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')extension='webp';
 }else if(kind==='video'){
  if(b.length>=12&&ascii(4,8)==='ftyp')extension='mp4';
  else if(b.length>=12&&['moov','mdat','wide'].includes(ascii(4,8)))extension='mov';
  else if(b.length>=4&&b.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])))extension='webm';
 }
 if(!extension)throw Object.assign(new Error('Unsupported public media content'),{status:400});
 return String(name).replace(/\.[^.]*$/,'').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,100)+'.'+extension;
}
