import {createProfilePhotoService} from './profile-photo.mjs';
import {adminDashboard} from './admin-dashboard.mjs';
import {createJewellerService,jewellerAccess} from './jeweller-service.mjs';
import {categoryKey,inventoryPublic} from '../inventory.mjs';
import { createHash,createHmac,timingSafeEqual,randomUUID } from 'node:crypto';
import { createAssetRegistry,canonicalAssetManifest } from '@ames/engine';
import { documentId } from './appwrite.mjs';
import { isMatchingEligible,rankJewellers } from '../jeweller-matching.ts';
export const TIERS=['PUBLIC','MEMBER','PREMIUM','COLLECTOR','PRIVATE'];
export const EVENTS=['JEWELRY_VIEWED','STONE_VIEWED','SAVED','FAVORITED','COMPARED','PREMIUM_PREVIEWED','ACCESS_GRANTED','ACCESS_DENIED','SUBSCRIPTION_STARTED','RESERVE_REQUEST','ENQUIRY_REQUEST','DESK_HANDOFF','SOURCING_REQUEST'];
const REQUEST_STATUSES=['OPEN','MATCHED','CONTACTED','CLOSED','CANCELLED'];
const JEWELLER_STATUSES=['APPLIED','UNDER_REVIEW','VERIFIED','REJECTED','SUSPENDED'];
const INVENTORY_STATUSES=['DRAFT','PENDING_REVIEW','APPROVED','REJECTED','CHANGES_REQUESTED','SUSPENDED','SOLD','ARCHIVED'];
const LEAD_STATUSES=['NEW','ROUTED','ACCEPTED','QUOTED','RESERVED','SOLD','DECLINED','EXPIRED'];
const error=(status,message)=>Object.assign(new Error(message),{status});
const id=v=>{if(typeof v!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(v))throw error(400,'Invalid identifier');return v;};
const sha=v=>createHash('sha256').update(v).digest('hex');
const alive=(record,now)=>record&&(!record.expiresAt||Number.isFinite(Date.parse(record.expiresAt))&&Date.parse(record.expiresAt)>now);
export function createCustomerService(config,gateway,clock=Date.now) {
  const jewellers=createJewellerService(config,gateway,clock);const profilePhoto=createProfilePhotoService(config,gateway,clock);
  const secure=new URL(config.origin).protocol==='https:',cookieName=secure?'__Host-ames_customer':'ames_customer',guestCookieName=secure?'__Host-ames_guest':'ames_guest';
  const json=(value,status=200,headers={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
  const session=req=>{const found=(req.headers.get('cookie')||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(cookieName+'='));if(found.length!==1)return '';try{return decodeURIComponent(found[0].slice(cookieName.length+1));}catch{return '';}};
  const cookie=(secret,seconds)=>`${cookieName}=${encodeURIComponent(secret)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure?'; Secure':''}`;
  const guestCookie=(token,seconds)=>`${guestCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure?'; Secure':''}`;
  const guestSeal=guestId=>{const payload=Buffer.from(JSON.stringify({guestId,expires:clock()+31536000000})).toString('base64url');return payload+'.'+createHmac('sha256',config.deliverySecret).update(payload).digest('base64url');};
  const guestUnseal=token=>{try{if(typeof token!=='string'||token.length>512)return null;const [payload,sig,extra]=token.split('.');if(extra||!sig)return null;const expected=createHmac('sha256',config.deliverySecret).update(payload).digest(),actual=Buffer.from(sig,'base64url');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;const data=JSON.parse(Buffer.from(payload,'base64url').toString());return typeof data.guestId==='string'&&/^[a-f0-9-]{36}$/.test(data.guestId)&&data.expires>clock()?data:null;}catch{return null;}};
  const guestToken=req=>{const raw=(req.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(guestCookieName+'='));if(!raw)return null;try{return decodeURIComponent(raw.slice(guestCookieName.length+1));}catch{return null;}};
  async function identity(req,required=false,createGuest=false){const token=session(req);if(!token){const existing=guestUnseal(guestToken(req));if(existing)return {id:'guest:'+existing.guestId,guest:true,name:'',email:'',admin:false};if(createGuest){const guestId=randomUUID();return {id:'guest:'+guestId,guest:true,name:'',email:'',admin:false,guestToken:guestSeal(guestId)};}if(required)throw error(401,'Sign in required');return null;}
    try {const user=await gateway.user(token);if(!user.status)throw error(401,'Account unavailable');const profile=await gateway.get('profiles',documentId(user.$id));if(profile?.accountState==='disabled')throw error(403,'Account unavailable');return {id:user.$id,name:user.name,email:user.email,admin:user.labels?.includes('amesadmin')===true,labelsPresent:Array.isArray(user.labels)&&user.labels.length>0,guest:false};}
    catch(e){if([401,403].includes(e.status)||[401,403,404].includes(e.code))throw error(401,'Session expired');throw e;}
  }
  async function catalogAsset(assetId){const record=await gateway.get('catalog',documentId(id(assetId)));if(!record||record.status!=='published'||(record.kind==='JEWELLER_INVENTORY'&&record.inventoryStatus!=='APPROVED'))throw error(404,'Asset unavailable');return record;}
  async function allowed(user,asset){
    if(asset.status!=='published'||!TIERS.includes(asset.accessTier))return false;
    const grants=user?await gateway.list('entitlements',{userId:user.id}):[];
    const relevant=grants.filter(g=>alive(g,clock())&&(!g.assetId||g.assetId===asset.id));
    if(relevant.some(g=>g.effect==='deny'))return false;
    if(asset.accessTier==='PUBLIC')return true;
    if(!user)return false;
    if(user.admin)return true;
    if(asset.accessTier==='MEMBER')return true;
    if(asset.ownerId===user.id)return true;
    if(relevant.some(g=>g.effect==='allow'&&(g.assetId===asset.id||asset.accessTier!=='PRIVATE'&&g.tier===asset.accessTier)))return true;
    if(asset.accessTier==='PRIVATE')return false;
    return (await gateway.list('subscriptions',{userId:user.id})).some(s=>s.status==='active'&&s.tier===asset.accessTier&&alive(s,clock()));
  }
  async function audit(user,type,assetId='',metadata={}){await gateway.put('events',randomUUID(),{userId:user?.id||'',assetId,kind:type,time:new Date(clock()).toISOString(),...metadata});}
  async function mergeGuest(guest,account){
    if(!guest?.guest)return;
    const guestId=guest.id,accountId=account.id;
    const [guestProfile,accountProfile]=await Promise.all([gateway.get('profiles',documentId(guestId)),gateway.get('profiles',documentId(accountId))]);
    const gm=guestProfile?.preferences?.memory,am=accountProfile?.preferences?.memory;
    if(gm){const merged={...gm,...(am||{})};for(const key of ['categories','shapes','metals','occasions','recentInterests']){const values=[...(Array.isArray(gm[key])?gm[key]:[]),...(Array.isArray(am?.[key])?am[key]:[])].filter(v=>typeof v==='string');if(values.length)merged[key]=[...new Set(values)].slice(-8);}if(!am?.budgetRange&&gm.budgetRange)merged.budgetRange=gm.budgetRange;if(!am?.language&&gm.language)merged.language=gm.language;await gateway.put('profiles',documentId(accountId),{...accountProfile,userId:accountId,kind:'profile',accountState:accountProfile?.accountState||'active',preferences:{...(accountProfile?.preferences||{}),memory:merged}});}
    for(const route of ['favorites','saved']) for(const row of await gateway.list(route,{userId:guestId})) await gateway.put(route,documentId(accountId,row.assetId),{...row,userId:accountId});
    for(const row of await gateway.list('events',{userId:guestId})) await gateway.put('events',row.id,{...row,userId:accountId});
    await gateway.put('profiles',documentId(guestId),{userId:guestId,kind:'profile',accountState:'merged',preferences:{...(guestProfile?.preferences||{}),mergedInto:accountId}});
  }
  async function canAccess(userId,assetId){
    // Internal authority: callers must obtain userId from verified Appwrite identity.
    if(userId&&(await gateway.get('profiles',documentId(userId)))?.accountState==='disabled')return false;
    return allowed(userId?{id:userId,admin:false}:null,await catalogAsset(assetId));
  }
  function publicRecord(asset){const normalized=asset.kind==='JEWELLER_INVENTORY'?{...asset,category:categoryKey(asset.category),metalCompatibility:[]}:asset;const parsed=createAssetRegistry({schemaVersion:1,assets:[{...normalized,assetPath:`/api/customer/assets/${encodeURIComponent(asset.id)}.glb`}]}).require(asset.id);return {...parsed,...inventoryPublic(asset),category:normalized.category};}
  async function body(req){const reader=req.body?.getReader();if(!reader)throw error(400,'JSON body required');let size=0;const parts=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw error(413,'Request too large');}parts.push(value);}try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw error(400,'Invalid JSON');}}
  async function rate(req,email){
    // Atomic slot creation works across Vercel instances. No in-memory production limiter.
    const ip=req.headers.get('x-forwarded-for')?.split(',')[0].trim()||'unknown';
    for(const key of [sha(email.toLowerCase()),sha(ip)]) {let reserved=false;const window=Math.floor(clock()/600000);
      for(let slot=0;slot<10;slot++){try{await gateway.put('limits',documentId(key,window,slot),{kind:'auth',expiresAt:new Date((window+2)*600000).toISOString()},true);reserved=true;break;}catch(e){if(e.code!==409)throw e;}}
      if(!reserved)throw error(429,'Too many attempts; try later');
    }
  }
  function signature(asset,user,token,exp){return createHmac('sha256',config.deliverySecret).update(JSON.stringify([asset.id,asset.revision,user.id,sha(token),exp])).digest('base64url');}
  async function handle(req){try{
    const url=new URL(req.url),segments=url.pathname.replace(/^\/api\/customer\/?/,'').split('/').filter(Boolean),method=req.method;
    if(!['GET','POST','PUT','DELETE'].includes(method))return json({error:'Method not allowed'},405);
    if(method!=='GET'&&req.headers.get('origin')!==config.origin)throw error(403,'Origin denied');
    const [route,param]=segments;
    if(route==='jewellers'&&param==='apply'&&method==='POST'){
      const b=await body(req),text=(key,max=500)=>typeof b[key]==='string'?b[key].trim().slice(0,max):'',list=(key,max=30)=>Array.isArray(b[key])?[...new Set(b[key].filter(v=>typeof v==='string').map(v=>v.trim()).filter(Boolean))].slice(0,max):[];
      const businessName=text('businessName',160),legalEntityName=text('legalEntityName',200),email=text('email',254).toLowerCase(),phone=text('phone',60),website=text('website',500);
      if(!businessName||!legalEntityName||!email||!email.includes('@')||!phone)throw error(400,'Business name, legal entity, valid email and phone are required');
      let domain='';if(website){try{const parsed=new URL(/^https?:\/\//i.test(website)?website:`https://${website}`);domain=parsed.hostname.toLowerCase().replace(/^www\./,'');}catch{throw error(400,'Website must be valid');}}
      const norm=v=>v.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,''),phoneKey=phone.replace(/\D/g,''),keys={legal:norm(legalEntityName),email,phone:phoneKey,domain};
      const existing=await gateway.list('jewellers');
      if(existing.some(row=>row.duplicateKeys&&Object.entries(keys).some(([key,value])=>value&&row.duplicateKeys[key]===value)))throw error(409,'An application with matching business contact details already exists');
      const applicationId=randomUUID(),now=new Date(clock()).toISOString();
      const capabilities={languages:list('languages'),countriesServed:list('countriesServed'),categories:list('categories'),shapes:list('diamondShapes'),metals:list('metals'),priceBands:Array.isArray(b.priceBands)?b.priceBands.filter(v=>v&&typeof v==='object').slice(0,10).map(v=>({...(Number.isFinite(v.min)?{min:v.min}:{}),...(Number.isFinite(v.max)?{max:v.max}:{}),...(typeof v.currency==='string'&&v.currency.trim()?{currency:v.currency.trim().slice(0,12)}:{})})).filter(v=>Object.keys(v).length):[],bespoke:typeof b.bespoke==='boolean'?b.bespoke:undefined,looseDiamonds:typeof b.looseDiamonds==='boolean'?b.looseDiamonds:undefined,certifications:list('certificationSupport'),provenance:typeof b.provenance==='boolean'?b.provenance:undefined,reserve:typeof b.reserve==='boolean'?b.reserve:undefined,delivery:typeof b.delivery==='boolean'?b.delivery:undefined,leadTime:text('leadTimes',200)||undefined,afterSales:typeof b.afterSales==='boolean'?b.afterSales:undefined,returns:typeof b.returns==='boolean'?b.returns:undefined};
      let applicant=null;try{applicant=await identity(req,false,false);}catch(e){if(e.status!==401)throw e;}
      await gateway.put('jewellers',applicationId,{userId:applicant&&!applicant.guest?applicant.id:'',assetId:'',kind:'JEWELLER_APPLICATION',applicationId,businessName,legalEntityName,country:text('country',120),city:text('city',120),contactPerson:text('contactPerson',160),email,phone,website,socialLinks:list('socialLinks',10),capabilities,duplicateKeys:keys,verificationStatus:'APPLIED',verified:false,matchingEligible:false,internalNotes:'',verificationDate:null,createdAt:now,updatedAt:now},true);
      return json({ok:true,applicationId,status:'APPLIED'},201);
    }
    if(['login','register'].includes(route)&&method==='POST'){
      // A fresh credential exchange must not depend on a previous account session.
      // Only a valid signed guest cookie is relevant to guest-data migration.
      const guestData=guestUnseal(guestToken(req)),guestBefore=guestData?{id:'guest:'+guestData.guestId,guest:true}:null;
      const b=await body(req);if(typeof b.email!=='string'||b.email.length>254||!b.email.includes('@')||typeof b.password!=='string'||b.password.length<8||b.password.length>256)throw error(400,'Enter a valid email and a password of at least 8 characters.');
      const email=b.email.trim().toLowerCase();await rate(req,email);
      if(route==='register')await gateway.register(email,b.password,typeof b.name==='string'?b.name.trim().slice(0,100):'');
      let result;try{result=await gateway.login(email,b.password);}catch(e){if(e.code===401&&(!e.type||e.type==='user_invalid_credentials'))throw error(401,'Email or password is incorrect. Check your details and try again.');throw e;}
      const seconds=Math.min(86400,Math.floor((Date.parse(result.expire)-clock())/1000));
      if(typeof result.secret!=='string'||!result.secret||result.secret.length>2048||!/^[A-Za-z0-9._~+/=-]+$/.test(result.secret)||!Number.isSafeInteger(seconds)||seconds<=0)throw error(503,'Session unavailable');
      try{
        const account=await gateway.user(result.secret),profileId=documentId(account.$id),profile=await gateway.get('profiles',profileId);
        if(!account.status||profile?.accountState==='disabled')throw error(403,'This account is unavailable. Contact AMES for assistance.');
        if(!profile){try{await gateway.put('profiles',profileId,{userId:account.$id,kind:'profile',accountState:'active',preferences:{}},true);}catch(e){if(e.code!==409)throw e;}}
        try{await mergeGuest(guestBefore,{id:account.$id});}catch{/* Guest migration must not prevent a valid sign-in. */}
        const response=json({ok:true},200,{'Set-Cookie':cookie(result.secret,seconds)});response.headers.append('Set-Cookie',guestCookie('',0));return response;
      }catch(e){try{await gateway.logout(result.secret);}catch{/* Preserve the original failure; never issue a cookie for this session. */}throw e;}
    }
    if(route==='logout'&&method==='POST'){const token=session(req);if(token){try{await gateway.logout(token);}catch(e){if(![401,404].includes(e.code))throw e;}}const response=json({ok:true},200,{'Set-Cookie':cookie('',0)});response.headers.append('Set-Cookie',guestCookie('',0));return response;}
    const user=await identity(req,false,route==='session');
    if(route==='access-check'&&method==='GET'){let access;try{access=await jewellerAccess(user,gateway);}catch{access={allowed:false,reason:'UNAVAILABLE',linkedRecordFound:null,verificationStatus:null};}return json({authenticated:!!user&&!user.guest,labelsPresent:!!user?.labelsPresent,amesadminPresent:user?.admin===true,adminAllowed:user?.admin===true,jeweller:{linkedRecordFound:access.reason==='UNAVAILABLE'?null:access.linkedRecordFound===true,verificationStatus:access.verificationStatus??null,allowed:access.allowed,reason:access.reason}});}
    if(route==='jewellers')return await jewellers.handle(req,user,segments.slice(1),body,json);
    if(route==='inventory-media'&&method==='GET')return await jewellers.publicMedia(req,user,segments[1],segments[2]);
    if(route==='session'&&method==='GET'){
      const guest=user?.guest?user:null;
      if(guest?.guestToken)await gateway.put('profiles',documentId(guest.id),{userId:guest.id,kind:'profile',accountState:'active',preferences:{}},true).catch(e=>{if(e.code!==409)throw e;});
      let portal={allowed:false,reason:'NOT_SIGNED_IN'};if(user&&!user.guest){try{const access=await jewellerAccess(user,gateway);portal={allowed:access.allowed,reason:access.reason};}catch{portal={allowed:false,reason:'UNAVAILABLE'};}}
      return json({user:guest?.guest?null:user,guest:Boolean(guest?.guest),access:{admin:!!user?.admin,jeweller:portal.allowed,jewellerReason:portal.reason}},200,guest?.guestToken?{'Set-Cookie':guestCookie(guest.guestToken,31536000)}:{});
    }
    if(route==='catalog'&&method==='GET'){
      const rows=await gateway.list('catalog');const assets=[];
      for(const asset of rows){if(asset.status!=='published')continue;if(asset.kind==='JEWELLER_INVENTORY'&&asset.inventoryStatus!=='APPROVED')continue;if(asset.accessTier==='PRIVATE'&&!await allowed(user,asset))continue;assets.push(publicRecord(asset));}
      return json({schemaVersion:1,assets});
    }
    if(route==='reserve'&&method==='POST'){
      const b=await body(req),asset=await catalogAsset(b.assetId);if(!await allowed(user,asset))throw error(403,'This asset is locked');
      const conversationId=typeof b.conversationId==='string'?b.conversationId.slice(0,256):'';
      await audit(user,'RESERVE_REQUEST',asset.id,{status:'PENDING',conversationId,context:typeof b.context==='string'?b.context.slice(0,500):'',jewellerId:asset.jewellerId||'',intentSummary:typeof b.intentSummary==='string'?b.intentSummary.slice(0,1000):'',confidence:b.confidence&&typeof b.confidence==='object'?b.confidence:undefined});
      if(asset.kind==='JEWELLER_INVENTORY') await gateway.put('events',randomUUID(),{userId:user?.id||'',assetId:asset.id,kind:'INVENTORY_LEAD',leadStatus:'NEW',jewellerId:asset.jewellerId||'',inventoryId:asset.id,conversationId,context:typeof b.context==='string'?b.context.slice(0,500):'',time:new Date(clock()).toISOString()});
      return json({ok:true,status:'PENDING',assetId:asset.id});
    }
    if(route==='handoff'&&method==='POST'){
      const b=await body(req),assetId=typeof b.assetId==='string'?b.assetId:'';let assetName='';if(assetId){const asset=await catalogAsset(assetId);if(!await allowed(user,asset))throw error(403,'This asset is locked');assetName=asset.name;}
      const intent=['reserve','enquiry','consultation'].includes(b.intent)?b.intent:'enquiry';
      await audit(user,'DESK_HANDOFF',assetId,{status:'REQUESTED',intent,context:typeof b.context==='string'?b.context.slice(0,500):'',jewellerId:assetId?(await catalogAsset(assetId)).jewellerId||'':''});
      if(assetId){const asset=await catalogAsset(assetId);if(asset.kind==='JEWELLER_INVENTORY') await gateway.put('events',randomUUID(),{userId:user?.id||'',assetId,kind:'INVENTORY_LEAD',leadStatus:'NEW',jewellerId:asset.jewellerId||'',inventoryId:assetId,context:typeof b.context==='string'?b.context.slice(0,500):'',time:new Date(clock()).toISOString()});}
      const number=(config.deskWhatsapp||'').replace(/[^0-9]/g,'');
      const text=`Hello, I'm enquiring through AMES${assetName?` about the ${assetName}`:''}. I'd like to ${intent==='reserve'?'confirm availability and reserve the piece':'speak with the desk about this enquiry'}.`;
      return json({ok:true,whatsappUrl:number?`https://wa.me/${number}?text=${encodeURIComponent(text)}`:null});
    }
    if(route==='request'&&method==='POST'){
      const b=await body(req),profile=b.profile&&typeof b.profile==='object'?b.profile:{};
      const clean=Object.fromEntries(['category','jewelry_type','budget','budget_min','budget_max','currency','metal','shape','occasion','recipient','size','timing','urgency','style','purpose','motive','friction','sourcing_intent','bespoke','certification_preference','location','language','overallConfidence','confidence'].filter(k=>typeof profile[k]==='string'||typeof profile[k]==='number'||typeof profile[k]==='boolean'||(k==='confidence'&&profile[k]&&typeof profile[k]==='object')).map(k=>[k,typeof profile[k]==='string'?profile[k].slice(0,120):profile[k]]));
      if(!clean.category||typeof clean.category!=='string')throw error(400,'Request category required');
      let profiles=[];try{profiles=(await gateway.list('jewellers')).filter(isMatchingEligible);}catch{/* The approved network is optional; an empty list remains a valid sourcing state. */}
      const matches=rankJewellers(clean,profiles,{country:typeof clean.location==='string'?clean.location:undefined,requiredCertification:typeof clean.certification_preference==='string'?clean.certification_preference:undefined}).slice(0,3);
      const requestId=randomUUID();
      await gateway.put('events',requestId,{userId:user?.id||'',assetId:'',kind:'SOURCING_REQUEST',time:new Date(clock()).toISOString(),status:'OPEN',profile:clean,notes:typeof b.notes==='string'?b.notes.slice(0,1000):'',conversationId:typeof b.conversationId==='string'?b.conversationId.slice(0,256):'',matches:matches.map(match=>({...match,status:'CANDIDATE'}))});
      for(const match of matches) await gateway.put('sourcingMatches',documentId(requestId,match.jewellerId),{userId:user?.id||'',assetId:requestId,kind:'SOURCING_MATCH',requestId,...match});
      return json({ok:true,status:'OPEN'});
    }
    if(route==='access'&&method==='GET'){const asset=await catalogAsset(param);const granted=await allowed(user,asset);await audit(user,granted?'ACCESS_GRANTED':'ACCESS_DENIED',asset.id);return json({granted});}
    if(route==='delivery'&&method==='POST'){
      if(!user||user.guest)throw error(401,'Sign in required');const asset=await catalogAsset(param);
      if(!await allowed(user,asset)){await audit(user,'ACCESS_DENIED',asset.id);throw error(403,'This asset is locked');}
      const exp=clock()+60000;await audit(user,'ACCESS_GRANTED',asset.id);
      return json({url:`${config.origin}/api/customer/assets/${encodeURIComponent(asset.id)}.glb?expires=${exp}&signature=${signature(asset,user,session(req),exp)}`,expiresAt:exp});
    }
    if(route==='assets'&&method==='GET'){
      const asset=await catalogAsset(param?.replace(/\.glb$/,''));
      if(asset.accessTier!=='PUBLIC'){
        if(!user||user.guest)throw error(401,'Sign in required');const exp=Number(url.searchParams.get('expires')),sig=url.searchParams.get('signature')||'',expected=signature(asset,user,session(req),exp);
        if(!Number.isSafeInteger(exp)||exp<=clock()||exp>clock()+60000||!/^[A-Za-z0-9_-]{43}$/.test(sig)||sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))throw error(403,'Asset lease expired or invalid');
      }
      if(!await allowed(user,asset))throw error(403,'This asset is locked');
      const ref=asset.storage;if(!ref||!Object.values(config.buckets).includes(ref.bucketId))throw error(503,'Asset storage unavailable');
      // No redirect or Appwrite token leaves this server. URL knowledge is insufficient.
      const response=await gateway.stream(ref,req.signal);
      return new Response(response.body,{headers:{'Content-Type':'model/gltf-binary','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline'}});
    }
    if(route==='profile-photo')return await profilePhoto(req,user,json);
    if(route==='admin'&&(!user||user.guest))throw error(401,'Sign in required');
    if(!user)throw error(401,'Sign in required');
    if(route==='state'&&method==='GET')return json({profile:await gateway.get('profiles',documentId(user.id)),favorites:await gateway.list('favorites',{userId:user.id}),saved:await gateway.list('saved',{userId:user.id}),designs:await gateway.list('designs',{userId:user.id}),entitlements:await gateway.list('entitlements',{userId:user.id}),subscriptions:await gateway.list('subscriptions',{userId:user.id})});
    if(['favorites','saved'].includes(route)&&['PUT','DELETE'].includes(method)){
      const b=await body(req),asset=await catalogAsset(b.assetId);if(!await allowed(user,asset))throw error(403,'This asset is locked');
      const kind=asset.category==='stone'?'stone':'jewelry',key=documentId(user.id,asset.id);
      if(method==='DELETE')await gateway.remove(route,key);else {await gateway.put(route,key,{userId:user.id,assetId:asset.id,kind});await audit(user,route==='favorites'?'FAVORITED':'SAVED',asset.id);}
      return json({ok:true});
    }
    if(route==='preferences'&&method==='PUT'){
      const b=await body(req),preferences={};for(const k of Object.keys(b)){if(k==='memory'){if(!b.memory||typeof b.memory!=='object'||Array.isArray(b.memory)||JSON.stringify(b.memory).length>5000)throw error(400,'Invalid customer memory');const allowedKeys=['categories','shapes','metals','budgetRange','occasions','recentInterests','lastSourcingRequest','lastConversationContext','language'];for(const key of Object.keys(b.memory)){if(!allowedKeys.includes(key))throw error(400,'Unsupported memory field');}preferences.memory=b.memory;continue;}if(!['appearance','glow','sound','haptics'].includes(k))throw error(400,'Unsupported preference');if(['sound','haptics'].includes(k)?typeof b[k]!=='boolean':typeof b[k]!=='string'||!['Midnight','Ivory','Rich','Subtle'].includes(b[k]))throw error(400,'Invalid preference');preferences[k]=b[k];}
      const old=await gateway.get('profiles',documentId(user.id));await gateway.put('profiles',documentId(user.id),{...old,userId:user.id,kind:'profile',accountState:old?.accountState||'active',preferences:{...old?.preferences,...preferences}});return json({ok:true});
    }
    if(route==='designs'&&['PUT','DELETE'].includes(method)){
      const b=await body(req),key=documentId(user.id,id(b.designId));
      if(method==='DELETE')await gateway.remove('designs',key);else {if(!b.spec||typeof b.spec!=='object'||!['ring','watch','bracelet','necklace','earring'].includes(b.spec.category)||JSON.stringify(b.spec).length>30000)throw error(400,'Invalid design specification');await gateway.put('designs',key,{userId:user.id,kind:'design',designId:b.designId,spec:b.spec,status:'draft'});}return json({ok:true});
    }
    if(route==='events'&&method==='POST'){const b=await body(req);if(!EVENTS.includes(b.type)||['ACCESS_GRANTED','ACCESS_DENIED','SUBSCRIPTION_STARTED','RESERVE_REQUEST','ENQUIRY_REQUEST','DESK_HANDOFF','SOURCING_REQUEST'].includes(b.type))throw error(400,'Unsupported event');if(b.assetId)await catalogAsset(b.assetId);await audit(user,b.type,b.assetId||'');return json({ok:true});}
    if(route==='admin'&&param==='dashboard'&&method==='GET'){if(!user.admin)throw error(403,'Administrator required');try{return json(await adminDashboard(gateway));}catch(e){if(e.code===404)throw Object.assign(error(503,'Your admin access is confirmed, but dashboard data is not configured. Contact AMES to complete setup.'),{reason:'ADMIN_DATA_UNAVAILABLE'});throw e;}}
    if(route==='admin'&&method==='PUT'){
      if(!user.admin)throw error(403,'Administrator required');const b=await body(req);
      if(param==='catalog'){
        const asset=b.asset;if(!asset||!TIERS.includes(asset.accessTier)||!Number.isSafeInteger(asset.revision)||asset.revision<1)throw error(400,'Invalid catalog metadata');
        try{createAssetRegistry({schemaVersion:1,assets:[{...asset,assetPath:`/api/customer/assets/${id(asset.id)}.glb`}]});}catch{throw error(400,'Invalid catalog metadata');}
        if(!asset.storage||!Object.values(config.buckets).includes(asset.storage.bucketId))throw error(400,'Invalid storage reference');
        if(canonicalAssetManifest.assets.some(a=>a.id===asset.id)&&asset.accessTier!=='PUBLIC')throw error(400,'Existing public canonical assets cannot be made protected');
        if(asset.previewPath!==null)throw error(400,'Preview publishing requires a separate approved public preview');
        const file=await gateway.fileInfo(asset.storage);if(file.$permissions?.length||file.mimeType!=='model/gltf-binary'&& !file.name?.endsWith('.glb'))throw error(400,'GLB must have private permissions');
        const old=await gateway.get('catalog',documentId(asset.id));if(old&&asset.revision<=old.revision)throw error(409,'Revision must increase');
        await gateway.put('catalog',documentId(asset.id),{...asset,assetPath:`/api/customer/assets/${asset.id}.glb`,userId:'',assetId:asset.id,kind:asset.category});
      }else if(param==='inventory'){
        const inventoryId=typeof b.inventoryId==='string'?b.inventoryId:'';if(!inventoryId)throw error(400,'Inventory ID required');const current=await gateway.get('catalog',documentId(inventoryId));if(!current||current.kind!=='JEWELLER_INVENTORY')throw error(404,'Inventory item not found');const status=typeof b.status==='string'&&INVENTORY_STATUSES.includes(b.status)?b.status:null;if(!status)throw error(400,'Invalid inventory status');const jeweller=await gateway.get('jewellers',current.jewellerId);if(status==='APPROVED'&&(!jeweller||jeweller.verificationStatus!=='VERIFIED'))throw error(400,'Jeweller must be verified');if(status==='APPROVED'&&!categoryKey(current.category))throw error(400,'Controlled category required');const feedback=typeof b.reviewFeedback==='string'?b.reviewFeedback.trim().slice(0,2000):current.reviewFeedback||'';if(['REJECTED','CHANGES_REQUESTED'].includes(status)&&!feedback)throw error(400,'Review feedback required');const review={actorId:user.id,fromStatus:current.inventoryStatus,toStatus:status,time:new Date(clock()).toISOString(),reviewFeedback:feedback};const published=status==='APPROVED';await gateway.put('catalog',documentId(inventoryId),{...current,reviewedBy:user.id,reviewedAt:review.time,reviewHistory:[...(current.reviewHistory||[]),review].slice(-100),media:(current.media||[]).map(m=>({...m,visibility:m.kind==='cad'?'PRIVATE':published?'PUBLIC':'REVIEW_REQUIRED',reviewStatus:m.kind==='cad'?(m.reviewStatus||'PENDING_REVIEW'):status})),inventoryStatus:status,status:published?'published':status==='ARCHIVED'?'archived':'draft',updatedAt:new Date(clock()).toISOString(),internalNotes:typeof b.internalNotes==='string'?b.internalNotes.slice(0,4000):current.internalNotes||'',reviewFeedback:feedback});await audit(user,'INVENTORY_REVIEW',inventoryId,{...review,jewellerId:current.jewellerId});return json({ok:true,status});
      }else if(['entitlements','subscriptions'].includes(param)){
        id(b.userId);if(!TIERS.includes(b.tier)||!Number.isFinite(Date.parse(b.expiresAt))||Date.parse(b.expiresAt)<=clock())throw error(400,'Tier and future expiry required');
        if(param==='entitlements'&&!['allow','deny'].includes(b.effect)||param==='subscriptions'&&!['active','canceled','past_due'].includes(b.status))throw error(400,'Invalid access state');
        if(b.assetId)await catalogAsset(b.assetId);
        await gateway.put(param,documentId(b.userId,b.assetId||'',b.tier),{userId:b.userId,assetId:b.assetId||'',kind:param,tier:b.tier,effect:b.effect||'',status:b.status||'',expiresAt:b.expiresAt,issuer:user.id});
        if(param==='subscriptions'&&b.status==='active')await audit({id:b.userId},'SUBSCRIPTION_STARTED');
      }else if(param==='requests'){
        const requestId=typeof b.requestId==='string'?b.requestId:'';if(!requestId)throw error(400,'Request ID required');
        const current=await gateway.get('events',requestId);if(!current||current.kind!=='SOURCING_REQUEST')throw error(404,'Request not found');
        const status=b.status===undefined?current.status:(typeof b.status==='string'&&REQUEST_STATUSES.includes(b.status)?b.status:null);if(!status)throw error(400,'Invalid request status');
        const matchingRefs=Array.isArray(b.matchingRefs)?b.matchingRefs.filter(v=>typeof v==='string').slice(0,10):current.matchingRefs||[];
        for(const ref of matchingRefs){const asset=await catalogAsset(ref);if(asset.category==='stone')throw error(400,'Jewelry catalogue reference required');}
        await gateway.put('events',requestId,{...current,status,notes:typeof b.notes==='string'?b.notes.slice(0,1000):current.notes||'',matchingRefs});
        await audit(user,'SOURCING_REVIEW',requestId,{actorId:user.id,fromStatus:current.status,toStatus:status,requestId});return json({ok:true,status,matchingRefs});
      }else if(param==='jewellers'){
        const applicationId=typeof b.applicationId==='string'?b.applicationId:'';if(!applicationId)throw error(400,'Application ID required');
        const current=await gateway.get('jewellers',applicationId);if(!current||current.kind!=='JEWELLER_APPLICATION')throw error(404,'Application not found');
        const status=typeof b.status==='string'&&JEWELLER_STATUSES.includes(b.status)?b.status:null;if(!status)throw error(400,'Invalid verification status');
        const transitions={APPLIED:['UNDER_REVIEW','VERIFIED','REJECTED'],UNDER_REVIEW:['VERIFIED','REJECTED'],VERIFIED:['SUSPENDED'],REJECTED:['UNDER_REVIEW'],SUSPENDED:['VERIFIED','UNDER_REVIEW']};if(status!==current.verificationStatus&&!transitions[current.verificationStatus]?.includes(status))throw error(409,'Verification transition unavailable');
        const now=new Date(clock()).toISOString(),verified=status==='VERIFIED',verificationDate=verified?(current.verificationDate||now):current.verificationDate||null;
        await gateway.put('jewellers',applicationId,{...current,reviewedBy:user.id,reviewedAt:now,reviewHistory:[...(current.reviewHistory||[]),{actorId:user.id,time:now,fromStatus:current.verificationStatus,toStatus:status}].slice(-100),verificationStatus:status,verified,matchingEligible:verified,internalNotes:typeof b.internalNotes==='string'?b.internalNotes.slice(0,4000):current.internalNotes||'',verificationDate,updatedAt:now,lastVerifiedAt:verificationDate||undefined,...current.capabilities,location:[current.city,current.country].filter(Boolean).join(', ')||undefined,deliveryCountries:current.capabilities?.delivery===true?current.capabilities?.countriesServed:undefined});
        await audit(user,'JEWELLER_REVIEW',applicationId,{actorId:user.id,fromStatus:current.verificationStatus,toStatus:status,jewellerId:applicationId});return json({ok:true,status,matchingEligible:verified,verificationDate});
      }else throw error(404,'Not found');return json({ok:true});
    }
    if(route==='admin'&&param==='requests'&&method==='GET'){
      if(!user?.admin)throw error(403,'Administrator required');
      const rows=await gateway.list('events');
      return json({requests:rows.filter(r=>r.kind==='SOURCING_REQUEST').filter(r=>!url.searchParams.get('status')||r.status===url.searchParams.get('status')).sort((a,b)=>String(b.time||'').localeCompare(String(a.time||'')))});
    }
    if(route==='admin'&&param==='events'&&method==='GET'){
      if(!user?.admin)throw error(403,'Administrator required');
      const rows=await gateway.list('events');
      const kinds=new Set(['SOURCING_REQUEST','RESERVE_REQUEST','ENQUIRY_REQUEST','DESK_HANDOFF','INVENTORY_LEAD','SAVED','FAVORITED']);
      return json({events:rows.filter(r=>kinds.has(r.kind)).sort((a,b)=>String(b.time||'').localeCompare(String(a.time||'')))});
    }
    if(route==='admin'&&param==='jewellers'&&method==='GET'){
      if(!user?.admin)throw error(403,'Administrator required');
      const rows=await gateway.list('jewellers');return json({applications:rows.filter(r=>r.kind==='JEWELLER_APPLICATION').sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))});
    }
    if(route==='admin'&&param==='inventory'&&method==='GET'){
      if(!user?.admin)throw error(403,'Administrator required');const rows=await gateway.list('catalog');return json({items:rows.filter(r=>r.kind==='JEWELLER_INVENTORY').map(({internalNotes,...safe})=>({...safe,internalNotes:undefined}))});
    }
    throw error(404,'Not found');
  }catch(e){const configurationFailure=['general_unauthorized_scope','project_unknown','project_not_found','general_unknown_origin'].includes(e.type);const status=configurationFailure?503:e.status||([400,401,403,409,429].includes(e.code)?e.code:503);const message=e.status?e.message:status===401?'Invalid credentials':status===409?'Record already exists':status===429?'Too many attempts':'Customer service unavailable';return json({error:message,...(e.reason?{reason:e.reason}:{})},status);}}
  return {handle,canAccess,health:()=>gateway.health()};
}
