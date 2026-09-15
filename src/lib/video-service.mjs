import {randomUUID} from 'node:crypto';
import {approvedAsset,inventoryPublic} from './inventory.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export const decodeVideo=row=>({title:'',sortOrder:0,featured:false,...row,...JSON.parse(row.metadata||'{}')});
export function createVideoService(gateway){
 async function admin(req){const user=await gateway.identity(req);if(!user)fail(401,'Sign in required');if(user.admin!==true)fail(403,'Administrator required');if(req.method!=='GET'&&!gateway.sameOrigin(req))fail(403,'Origin denied');return user;}
 async function product(id){if(!id)return null;const a=await gateway.product(id);if(!approvedAsset(a)||!['PUBLIC','public'].includes(a.accessTier))fail(400,'Linked product must be approved and published');return inventoryPublic(a);}
 async function file(id,kind){if(typeof id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,35}$/.test(id))fail(400,'Invalid file reference');const f=await gateway.file(id);if(!f.name?.startsWith('ames-admin-'+kind+'-')||f.$permissions?.length)fail(400,'File must be a private AMES admin upload');return f;}
 async function handle(req){try{
  const url=new URL(req.url);
  if(req.method==='GET'&&url.searchParams.get('published')==='1'){
   const rows=(await gateway.list()).map(decodeVideo).filter(v=>v.status==='PUBLISHED');
   const result=await Promise.all(rows.map(async v=>{let linked=null;try{linked=await product(v.productAssetId);}catch{}return {id:v.id,title:v.title,caption:v.caption,status:v.status,video_url:`/api/videos/${v.id}/media`,thumbnailUrl:v.thumbnailFileId?`/api/videos/${v.id}/media?thumbnail=1`:null,productAssetId:linked?.id||null,product:linked,house_note:v.houseNote||'',featured:v.featured,sortOrder:v.sortOrder,created_at:v.created_at};}));
   return Response.json(result.sort((a,b)=>Number(b.featured)-Number(a.featured)||(a.sortOrder||0)-(b.sortOrder||0)||String(b.created_at).localeCompare(String(a.created_at))),{headers:{'Cache-Control':'no-store'}});
  }
  const user=await admin(req);
  if(req.method==='GET')return Response.json((await gateway.list()).map(decodeVideo),{headers:{'Cache-Control':'no-store'}});
  const b=req.method==='DELETE'?{id:url.searchParams.get('id')}:await req.json();
  const old=b.id?await gateway.get(b.id):null;if(b.id&&!old)fail(404,'Video not found');
  if(req.method==='DELETE'){if(!old||old.status!=='ARCHIVED')fail(409,'Archive before deleting');await gateway.remove(b.id);await gateway.audit?.({actorId:user.id,userId:user.id,assetId:b.id,time:new Date().toISOString(),fromStatus:old.status,toStatus:'DELETED'});return Response.json({ok:true});}
  if(!['POST','PATCH'].includes(req.method))fail(405,'Method unavailable');
  if(req.method==='PATCH'&&!old)fail(404,'Video not found');
  const current=old?decodeVideo(old):{};const v={...current,...b};
  if(!['DRAFT','PUBLISHED','ARCHIVED'].includes(v.status))fail(400,'Invalid video status');
  if(typeof v.caption!=='string'||!v.caption.trim()||v.caption.length>500)fail(400,'Caption required (maximum 500 characters)');
  if(typeof v.title!=='string'||v.title.length>180)fail(400,'Invalid title');
  if(!Number.isSafeInteger(v.sortOrder)||Math.abs(v.sortOrder)>100000)fail(400,'Invalid sort order');
  if(v.status!=='ARCHIVED'){await file(v.videoFileId,'video');if(v.thumbnailFileId)await file(v.thumbnailFileId,'image');}if(v.status==='PUBLISHED'||v.productAssetId!==current.productAssetId)await product(v.productAssetId);
  const now=new Date().toISOString(),id=old?.id||randomUUID();
  const metadata={title:v.title,videoFileId:v.videoFileId,thumbnailFileId:v.thumbnailFileId||'',productAssetId:v.productAssetId||'',featured:v.featured===true,sortOrder:v.sortOrder,createdBy:current.createdBy||user.id,updatedAt:now,publishedAt:v.status==='PUBLISHED'?(current.publishedAt||now):null};
  const data={video_url:`/api/videos/${id}/media`,caption:v.caption.trim(),status:v.status,published:v.status==='PUBLISHED',metadata:JSON.stringify(metadata),created_at:old?.created_at||now};
  await gateway.save(id,data,!old);await gateway.audit?.({actorId:user.id,userId:user.id,assetId:id,time:now,fromStatus:current.status||'NEW',toStatus:v.status});return Response.json(decodeVideo({id,...data}),{status:old?200:201});
 }catch(e){return Response.json({error:e.status?e.message:'Video service unavailable'},{status:e.status||503});}}
 return {handle,admin,file};
}
