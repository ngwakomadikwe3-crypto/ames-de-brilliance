import {randomUUID} from 'node:crypto';
import {documentId} from './appwrite.mjs';
import {validateInventoryUpload} from './inventory-upload.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function createProfilePhotoService(config,gateway,clock=Date.now){
 return async(req,user,json)=>{
  if(!user||user.guest)fail(401,'Sign in to manage your profile photo.');
  const key=documentId(user.id),profile=await gateway.get('profiles',key),old=profile?.photo;
  const safe=ref=>ref&&ref.uploadedBy===user.id&&ref.bucketId===config.buckets.jewelry&&typeof ref.fileId==='string';
  async function cleanup(ref){if(!safe(ref))return false;try{const current=await gateway.get('profiles',key);if(current?.photo?.fileId===ref.fileId)return false;await gateway.deleteProfileImage(ref,user.id);return true;}catch{return false;}}
  if(req.method==='GET'){
   if(!safe(old))fail(404,'No profile photo.');const upstream=await gateway.stream(old,req.signal);return new Response(upstream.body,{status:upstream.status,headers:{'Content-Type':old.mimeType,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline'}});
  }
  if(req.method==='DELETE'){
   const raw=await req.text();if(raw.trim()){let b;try{b=JSON.parse(raw);}catch{fail(400,'Invalid request');}if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).length)fail(400,'Profile photo is selected from your session.');}
   const next={...profile,userId:user.id,kind:'profile',photo:null};await gateway.put('profiles',key,next);const removed=old?await cleanup(old):true;return json({ok:true,cleanupPending:!removed});
  }
  if(req.method!=='POST')fail(405,'Method unavailable');
  if(Number(req.headers.get('content-length'))>2*1024*1024+65536)fail(413,'Profile photos must be 2 MiB or smaller.');
  const form=await req.formData();if([...form.keys()].some(k=>k!=='file')||form.getAll('file').length!==1)fail(400,'Choose one profile image.');
  const file=form.get('file');if(!(file instanceof File)||!file.size||file.size>2*1024*1024)fail(400,'Choose an image up to 2 MiB.');
  const bytes=Buffer.from(await file.arrayBuffer()),metadata=validateInventoryUpload(file,bytes,'image');
  const uploaded=await gateway.uploadMedia({bytes,name:`ames-profile-${key}-${randomUUID()}.${metadata.extension}`,bucketId:config.buckets.jewelry});
  const photo={...metadata,fileId:uploaded.$id,bucketId:config.buckets.jewelry,uploadedBy:user.id,uploadedAt:new Date(clock()).toISOString()};
  try{await gateway.put('profiles',key,{...profile,userId:user.id,kind:'profile',accountState:profile?.accountState||'active',photo});}catch(e){await cleanup(photo);throw e;}
  const removed=old?await cleanup(old):true;return json({photo,cleanupPending:!removed},201);
 };
}
