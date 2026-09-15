import {videoGateway,videoService} from './videos';
import {decodeVideo} from './video-service.mjs';
export async function videoMedia(req:Request,id:string,preview=false){try{
 let fileId=id;
 if(preview){await videoService.admin(req);}else{const raw=await videoGateway.get(id);if(!raw)return new Response(null,{status:404});const v=decodeVideo(raw);if(v.status!=='PUBLISHED')await videoService.admin(req);fileId=new URL(req.url).searchParams.has('thumbnail')?v.thumbnailFileId:v.videoFileId;}
 if(!fileId)return new Response(null,{status:404});
 const info=await videoGateway.file(fileId);if(!info.name.startsWith('ames-admin-')||info.$permissions.length)throw new Error('Invalid media');
 const endpoint=process.env.APPWRITE_ENDPOINT!.trim(),project=process.env.APPWRITE_PROJECT_ID!.trim();
 const headers:Record<string,string>={'X-Appwrite-Project':project,'X-Appwrite-Key':process.env.APPWRITE_API_KEY!};const range=req.headers.get('range');if(range){if(!/^bytes=\d*-\d*$/.test(range))return new Response(null,{status:416});headers.Range=range;}
 const upstream=await fetch(`${endpoint}/storage/buckets/media/files/${encodeURIComponent(fileId)}/view`,{headers,cache:'no-store',redirect:'error',signal:req.signal});
 const out=new Headers({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});for(const key of ['content-type','content-length','content-range','accept-ranges']){const value=upstream.headers.get(key);if(value)out.set(key,value);}return new Response(upstream.body,{status:upstream.status,headers:out});
 }catch(e:any){return Response.json({error:e.status?e.message:'Media unavailable'},{status:e.status||503});}}
