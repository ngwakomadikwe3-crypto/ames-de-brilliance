import {randomUUID} from 'node:crypto';
import {documentId} from './appwrite.mjs';
import {categoryKey,categoryLabel,inventoryPublic} from '../inventory.mjs';
import {assetRole,validateInventoryUpload,mediaSnapshot} from './inventory-upload.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o[k]!==undefined).map(k=>[k,o[k]]));
const text=(b,k,max=500)=>{if(b[k]===undefined)return '';if(typeof b[k]!=='string'||b[k].length>max)fail(400,'Invalid '+k);return b[k].trim();};
const list=(b,k)=>{if(b[k]===undefined)return [];if(!Array.isArray(b[k])||b[k].length>30||b[k].some(v=>typeof v!=='string'||v.length>160))fail(400,'Invalid '+k);return [...new Set(b[k].map(v=>v.trim()).filter(Boolean))];};
const only=(b,keys)=>{if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!keys.includes(k)))fail(400,'Unsupported fields');};
const number=(b,k,integer=false)=>{if(b[k]===undefined||b[k]===''||b[k]===null)return undefined;if(typeof b[k]!=='number'||!Number.isFinite(b[k])||b[k]<0||integer&&!Number.isSafeInteger(b[k]))fail(400,'Invalid '+k);return b[k];};
const url=value=>{if(!value)return '';try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)throw new Error();return u.href;}catch{fail(400,'Use an HTTPS media or website URL');}};
const PROFILE=['businessName','tradingName','contactPerson','phone','email','city','country','website','whatsapp','specialties','categories','bespoke','certifications','provenance','countriesServed','languages'];
const FIELDS=['name','category','description','sku','price','currency','availability','stockQuantity','leadTime','metal','setting','diamondShape','carat','color','clarity','cut','certification','certificationReference','provenanceNotes','origin','certificationNotes','images','video','glb','media'];
const safeInventory=row=>({...inventoryPublic(row),category:categoryLabel(categoryKey(row.category)),updatedAt:row.updatedAt,createdAt:row.createdAt,certificationNotes:row.certificationNotes||'',reviewFeedback:row.reviewFeedback||'',reviewedAt:row.reviewedAt,media:row.media||[]});
const safeProfile=own=>({...pick(own,['id','businessName','tradingName','contactPerson','phone','city','country','website','whatsapp','verificationStatus']),email:own.contactEmail||own.email,capabilities:pick(own.capabilities||{},['specialties','categories','bespoke','certifications','provenance','countriesServed','languages'])});
const safeResponse=r=>r?pick(r,['status','proposedPiece','price','currency','availability','deliveryEstimate','notes','expiresAt','inventoryId','createdAt','updatedAt','sentAt']):null;
export async function jewellerAccess(user,gateway){
 if(!user||user.guest)return {allowed:false,reason:'NOT_SIGNED_IN',message:'Sign in with the account used for your jeweller application.'};
 let rows;try{rows=(await gateway.list('jewellers')).filter(r=>r.kind==='JEWELLER_APPLICATION');}catch(e){if(e.code===404)throw Object.assign(new Error('Jeweller application records are unavailable. Contact AMES to complete portal setup.'),{status:503,reason:'JEWELLER_DATA_UNAVAILABLE'});throw e;}
 const matches=rows.filter(r=>typeof r.userId==='string'&&r.userId===user.id);
 if(!matches.length)return {allowed:false,reason:'APPLICATION_NOT_FOUND',message:'No jeweller application is linked to this account. Use the account you applied with, or submit an application.'};
 if(matches.length!==1)return {allowed:false,linkedRecordFound:true,verificationStatus:null,reason:'NOT_VERIFIED',message:'Your application link needs review. Contact AMES to confirm your account linkage.'};
 const own=matches[0],status=own.verificationStatus;
 if(status==='VERIFIED')return {allowed:true,linkedRecordFound:true,verificationStatus:status,reason:'VERIFIED',application:own};
 const messages={APPLIED:'Your application has been received and is awaiting review.',UNDER_REVIEW:'Your application is under review. Dashboard access opens after verification.',REJECTED:'Your application was not approved. Contact AMES about the next steps.',SUSPENDED:'Your jeweller access is suspended. Contact AMES for a review.'};
 return {allowed:false,linkedRecordFound:true,verificationStatus:status||null,reason:['APPLIED','UNDER_REVIEW','REJECTED','SUSPENDED'].includes(status)?status:'NOT_VERIFIED',message:messages[status]||'Your application is not verified. Contact AMES for assistance.'};
}
export async function verifiedJeweller(user,gateway){const access=await jewellerAccess(user,gateway);if(!access.allowed)throw Object.assign(new Error(access.message),{status:access.reason==='NOT_SIGNED_IN'?401:403,reason:access.reason});return access.application;}
export function createJewellerService(config,gateway,clock=Date.now){
 const now=()=>new Date(clock()).toISOString();
 async function inventory(own){return (await gateway.list('catalog')).filter(r=>r.kind==='JEWELLER_INVENTORY'&&r.jewellerId===own.id);}
 async function item(own,id){const row=await gateway.get('catalog',documentId(id));if(!row||row.kind!=='JEWELLER_INVENTORY'||row.jewellerId!==own.id)fail(404,'Inventory not found');return row;}
 async function mediaRecord(own,id){const row=await gateway.get('catalog',documentId('jeweller-media',id));if(!row||row.kind!=='JEWELLER_MEDIA'||row.jewellerId!==own.id)fail(404,'Media not found');return row;}
 async function leads(own){const matches=(await gateway.list('sourcingMatches')).filter(r=>r.kind==='SOURCING_MATCH'&&r.jewellerId===own.id);const result=[];for(const m of matches){const request=await gateway.get('events',m.requestId);if(request?.kind!=='SOURCING_REQUEST')continue;result.push({id:m.id,requestId:m.requestId,status:request.status,createdAt:request.time,profile:pick(request.profile||{},['category','shape','metal','budget','budget_min','budget_max','currency','urgency','certification_preference','location','language','bespoke','sourcing_intent']),response:safeResponse(m.response)});}return result;}
 async function summary(own){const [items,matched,events,favorites]=await Promise.all([inventory(own),leads(own),gateway.list('events'),gateway.list('favorites')]);const ids=new Set(items.map(r=>r.id));const scoped=events.filter(e=>ids.has(e.assetId));const count=kind=>scoped.filter(e=>e.kind===kind).length;return {approved:items.filter(r=>r.inventoryStatus==='APPROVED').length,pending:items.filter(r=>r.inventoryStatus==='PENDING_REVIEW').length,sourcingLeads:matched.length,openResponses:matched.filter(r=>['OPEN','MATCHED','CONTACTED'].includes(r.status)&&(!r.response||r.response.status==='DRAFT')).length,quoteResponses:matched.filter(r=>r.response?.status==='SENT').length,enquiries:count('ENQUIRY_REQUEST'),totalEnquiries:count('ENQUIRY_REQUEST')+count('RESERVE_REQUEST')+count('DESK_HANDOFF'),reservations:count('RESERVE_REQUEST'),handoffs:count('DESK_HANDOFF'),inventoryViews:count('JEWELRY_VIEWED'),favorites:favorites.filter(r=>ids.has(r.assetId)).length,sold:items.filter(r=>r.inventoryStatus==='SOLD').length};}
 async function cleanInventory(b,own,itemId,existing){
 const clean={};for(const k of FIELDS.filter(k=>!['price','stockQuantity','carat','images','media'].includes(k)))clean[k]=text(b,k,['description','provenanceNotes','certificationNotes'].includes(k)?2000:500);
 clean.category=categoryLabel(categoryKey(clean.category));if(!clean.category||!clean.name)fail(400,'Product name and controlled category required');
 clean.price=number(b,'price');clean.stockQuantity=number(b,'stockQuantity',true);clean.carat=number(b,'carat');clean.currency=clean.currency.toUpperCase();if(clean.currency&&!/^[A-Z]{3}$/.test(clean.currency))fail(400,'Use a three-letter currency');
 const refs=b.media===undefined?(existing?.media||[]):b.media;if(!Array.isArray(refs)||refs.length>24||refs.some(r=>!r||typeof r.fileId!=='string'||!['image','video','glb','gltf','cad'].includes(r.kind)))fail(400,'Invalid media references');
 if(refs.filter(r=>r.kind==='video').length>1||refs.filter(r=>['glb','gltf'].includes(r.kind)).length>1||refs.filter(r=>r.kind==='image').length>12)fail(400,'Too many media files');
 clean.media=[];for(const ref of refs){const record=await mediaRecord(own,ref.fileId);if(record.mediaKind!==ref.kind)fail(400,'Wrong media kind');const role=assetRole(ref.kind,ref.assetRole||(ref.kind==='image'?(clean.media.some(m=>m.kind==='image')?'gallery':'mainImage'):ref.kind==='glb'||ref.kind==='gltf'?'web3d':ref.kind));clean.media.push(mediaSnapshot(record,role));}
 if(new Set(refs.map(r=>r.fileId)).size!==refs.length||clean.media.filter(r=>r.assetRole==='mainImage').length>1)fail(400,'Duplicate media or main image');clean.media.sort((a,b)=>(b.assetRole==='mainImage')-(a.assetRole==='mainImage'));
 const path=ref=>`/api/customer/inventory-media/${itemId}/${ref.fileId}${['glb','gltf'].includes(ref.kind)?'/asset.'+ref.kind:''}`;
 const legacy=(value,prior)=>value&&value===prior?value:url(value);
 clean.images=(b.images||[]);if(!Array.isArray(clean.images)||clean.images.length>12)fail(400,'Invalid images');clean.images=clean.images.map(v=>legacy(v,existing?.images?.includes(v)?v:''));
 clean.video=legacy(clean.video,existing?.video);clean.glb=legacy(clean.glb,existing?.glb);
 if(clean.media.some(r=>r.kind==='image'))clean.images=clean.media.filter(r=>r.kind==='image').map(path);for(const kind of ['video','glb']){const ref=clean.media.find(r=>r.kind===kind||(kind==='glb'&&r.kind==='gltf'));if(ref)clean[kind]=path(ref);}
 if(clean.glb&&! /\.gltf?$|\.glb$/.test(clean.glb.split('?')[0]))fail(400,'Web 3D reference must end with .glb or .gltf');
 const glb=clean.media.find(r=>r.kind==='glb');clean.storage=glb?{bucketId:config.buckets.jewelry,fileId:glb.fileId}:undefined;
 return clean;
 }
 async function handle(req,user,segments,body,json){
 const own=await verifiedJeweller(user,gateway),[section,identifier]=segments,method=req.method;
 if(section==='me'&&method==='GET')return json({application:safeProfile(own)});
 if(section==='overview'&&method==='GET')return json({metrics:await summary(own)});
 if(section==='profile'){
  if(method==='GET')return json({profile:safeProfile(own)});
  if(method!=='PUT')fail(405,'Method unavailable');const b=await body(req);only(b,PROFILE);const update={};for(const k of ['businessName','tradingName','contactPerson','phone','city','country','website','whatsapp'])if(b[k]!==undefined)update[k]=text(b,k);if(!String(update.businessName??own.businessName).trim())fail(400,'Business name required');if(update.website)update.website=url(update.website);
  if(b.email!==undefined){update.contactEmail=text(b,'email',254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(update.contactEmail))fail(400,'Valid contact email required');}
  const capabilities={...own.capabilities};for(const k of ['specialties','categories','certifications','countriesServed','languages'])if(b[k]!==undefined)capabilities[k]=list(b,k);
  if(capabilities.categories?.some(c=>!categoryKey(c)))fail(400,'Invalid supplied category');capabilities.categories=capabilities.categories?.map(categoryKey);
  for(const k of ['bespoke','provenance'])if(b[k]!==undefined){if(typeof b[k]!=='boolean')fail(400,'Invalid '+k);capabilities[k]=b[k];}
  // Authorization uses userId. Keep the original application email as submitted; contactEmail is editable.
  const row={...own,...update,userId:user.id,location:[update.city??own.city,update.country??own.country].filter(Boolean).join(', '),deliveryCountries:capabilities.countriesServed,capabilities,...pick(capabilities,['specialties','categories','certifications','countriesServed','languages','bespoke','provenance']),updatedAt:now()};await gateway.put('jewellers',own.id,row);return json({profile:safeProfile(row)});
 }
 if(section==='inventory'){
  if(method==='GET')return json(identifier?{item:safeInventory(await item(own,identifier))}:{items:(await inventory(own)).map(safeInventory)});
  if(!['POST','PUT'].includes(method))fail(405,'Method unavailable');const b=await body(req);only(b,[...FIELDS,'action','revision']);const current=identifier?await item(own,identifier):null;const action=b.action||'save';
  if(current&&b.revision!==current.revision)fail(409,'Inventory changed. Reload before editing.');
  const allowed={save:['DRAFT','CHANGES_REQUESTED'],submit:['DRAFT','CHANGES_REQUESTED'],archive:['DRAFT','APPROVED'],sold:['APPROVED'],'request-edit':['APPROVED'],duplicate:['REJECTED']};if(!allowed[action]||current&&!allowed[action].includes(current.inventoryStatus)||!current&&action!=='save')fail(409,'Action unavailable for this inventory status');
  if(['archive','sold','request-edit','duplicate'].includes(action)&&Object.keys(b).some(k=>!['action','revision'].includes(k)))fail(400,'Status actions cannot edit product fields');
  const itemId=!current||action==='duplicate'?randomUUID():current.id;let row;
  if(['archive','sold','request-edit'].includes(action)){const status={archive:'ARCHIVED',sold:'SOLD','request-edit':'CHANGES_REQUESTED'}[action];row={...current,media:(current.media||[]).map(m=>({...m,visibility:m.kind==='cad'?'PRIVATE':'REVIEW_REQUIRED'})),inventoryStatus:status,status:status==='ARCHIVED'?'archived':'draft',updatedAt:now(),revision:current.revision+1};}
  else{const input=action==='duplicate'?{...pick(current,FIELDS),media:current.media||[]}:action==='submit'?{...pick(current||{},FIELDS),...b}:b;const clean=await cleanInventory(input,own,itemId,current);row={...current,...clean,id:itemId,assetId:itemId,userId:user.id,kind:'JEWELLER_INVENTORY',jewellerId:own.id,jewellerName:own.businessName,inventoryStatus:action==='submit'?'PENDING_REVIEW':'DRAFT',status:'draft',accessTier:'PUBLIC',revision:current&&action!=='duplicate'?current.revision+1:1,updatedAt:now(),createdAt:current&&action!=='duplicate'?current.createdAt:now(),assetPath:`/api/customer/assets/${itemId}.glb`,previewPath:null,materialSlots:[],stoneReferences:[],metalCompatibility:[],tags:[categoryKey(clean.category),clean.diamondShape,clean.metal].filter(Boolean),specs:[clean.metal,clean.diamondShape,clean.carat?`${clean.carat} ct`:'',clean.color,clean.clarity].filter(Boolean).join(' / ')};if(action==='duplicate'){delete row.internalNotes;delete row.reviewFeedback;}}
  await gateway.put('catalog',documentId(itemId),row,!current||action==='duplicate');return json({item:safeInventory(row)},!current||action==='duplicate'?201:200);
 }
 if(section==='leads'){
  const matched=await leads(own);if(method==='GET'){if(identifier){const lead=matched.find(r=>r.id===identifier);if(!lead)fail(404,'Lead not found');return json({lead});}return json({leads:matched});}
  if(method!=='PUT'||!identifier)fail(405,'Method unavailable');const lead=matched.find(r=>r.id===identifier);if(!lead)fail(404,'Lead not found');if(!['OPEN','MATCHED','CONTACTED'].includes(lead.status))fail(409,'This sourcing request is closed');
  const b=await body(req);only(b,['action','proposedPiece','price','currency','availability','deliveryEstimate','notes','expiresAt','inventoryId']);if(!['draft','respond','decline'].includes(b.action))fail(400,'Invalid response action');
  const match=await gateway.get('sourcingMatches',identifier);if(!match||match.jewellerId!==own.id)fail(404,'Lead not found');
  const response={};for(const k of ['proposedPiece','currency','availability','deliveryEstimate','notes','expiresAt','inventoryId'])response[k]=text(b,k,k==='notes'?2000:500);response.price=number(b,'price');response.currency=response.currency.toUpperCase();
  if(response.currency&&!/^[A-Z]{3}$/.test(response.currency))fail(400,'Use a three-letter currency');if(response.expiresAt&&(!Number.isFinite(Date.parse(response.expiresAt))||Date.parse(response.expiresAt)<=clock()))fail(400,'Quote expiry must be in the future');
  if(response.inventoryId){const linked=await item(own,response.inventoryId);if(linked.inventoryStatus!=='APPROVED')fail(400,'Link an approved inventory item');}
  if(b.action==='respond'&&!response.proposedPiece&&!response.notes&&!response.inventoryId)fail(400,'Response details required');if(response.price!==undefined&&!response.currency)fail(400,'Quote currency required');
  response.status={draft:'DRAFT',respond:'SENT',decline:'DECLINED'}[b.action];response.createdAt=match.response?.createdAt||now();response.updatedAt=now();if(b.action==='respond')response.sentAt=now();await gateway.put('sourcingMatches',identifier,{...match,response});return json({response:safeResponse(response)});
 }
 if(section==='quotes'&&method==='GET')return json({quotes:(await leads(own)).filter(r=>r.response)});
 if(section==='media'){
  if(method==='GET'&&identifier){const record=await mediaRecord(own,identifier);return stream(record,req);}
  if(method!=='POST')fail(405,'Method unavailable');if(Number(req.headers.get('content-length'))>4*1024*1024+65536)fail(413,'Upload limit is 4 MiB');const form=await req.formData(),file=form.get('file'),kind=form.get('kind');if(!(file instanceof File)||!file.size||file.size>4*1024*1024)fail(400,'Choose a file up to 4 MiB');
  const productId=form.get('productId');if(productId){const product=await item(own,String(productId));if(!['DRAFT','CHANGES_REQUESTED'].includes(product.inventoryStatus))fail(409,'Product is not editable');}
  const role=assetRole(kind,String(form.get('assetRole')||(kind==='image'?'gallery':kind==='glb'||kind==='gltf'?'web3d':kind)));
  const bytes=Buffer.from(await file.arrayBuffer()),metadata=validateInventoryUpload(file,bytes,kind);
  const uploaded=await gateway.uploadMedia({bytes,name:`jeweller-${kind}-${randomUUID()}.${metadata.extension}`,bucketId:config.buckets.jewelry});const record={userId:user.id,assetId:'',kind:'JEWELLER_MEDIA',jewellerId:own.id,mediaKind:kind,fileId:uploaded.$id,bucketId:config.buckets.jewelry,...metadata,assetRole:role,visibility:kind==='cad'?'PRIVATE':'REVIEW_REQUIRED',reviewStatus:'PENDING_REVIEW',uploadedBy:user.id,uploadedAt:now(),createdAt:now()};await gateway.put('catalog',documentId('jeweller-media',uploaded.$id),record,true);return json({...mediaSnapshot(record,role),url:`/api/customer/jewellers/media/${uploaded.$id}`},201);
 }
 fail(404,'Not found');
 }
 async function stream(record,req){const upstream=await gateway.stream({bucketId:record.bucketId,fileId:record.fileId},req.signal,req.headers.get('range'));const headers={'Content-Type':record.mimeType,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};if(record.mediaKind==='cad'){headers['Content-Type']='application/octet-stream';headers['Content-Disposition']=`attachment; filename*=UTF-8''${encodeURIComponent(record.fileName||'source.cad')}`;}for(const key of ['content-length','content-range','accept-ranges']){const value=upstream.headers.get(key);if(value)headers[key]=value;}return new Response(upstream.body,{status:upstream.status,headers});}
 async function publicMedia(req,user,itemId,fileId){const row=await gateway.get('catalog',documentId(itemId));if(!row||row.kind!=='JEWELLER_INVENTORY'||!row.media?.some(m=>m.fileId===fileId))fail(404,'Media unavailable');const record=await gateway.get('catalog',documentId('jeweller-media',fileId));if(!record||record.kind!=='JEWELLER_MEDIA'||record.jewellerId!==row.jewellerId)fail(404,'Media unavailable');if(record.mediaKind==='cad'||row.inventoryStatus!=='APPROVED'||row.status!=='published'){if(!user?.admin){const own=await verifiedJeweller(user,gateway);if(own.id!==row.jewellerId)fail(404,'Media unavailable');}}return stream(record,req);}

 return {handle,publicMedia};
}
