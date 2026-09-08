// Server/Edge compatible verification. Never trust identity or roles from request bodies.
const enc=new TextEncoder();
// SESSION_SECRET is server-only signing material for existing staff/portal cookies.
// Never expose it through NEXT_PUBLIC_ variables or derive it from a hostname.
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const un64=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
export function cookieValue(req,name){const values=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));if(values.length!==1)return '';try{return decodeURIComponent(values[0].slice(name.length+1));}catch{return '';}}
async function key(env){const secret=env.SESSION_SECRET;if(!secret||secret.length<32||secret==='adb-session-secret-2026')throw new Error('Signing unavailable');return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function signedPayload(token,env=process.env){try{if(!token||token.length>4096)return null;const [p,s,...extra]=token.split('.');if(extra.length)return null;const raw=new TextDecoder().decode(un64(p));if(!await crypto.subtle.verify('HMAC',await key(env),un64(s),enc.encode(raw)))return null;const data=JSON.parse(raw);if(!Number.isFinite(data.ts)||data.ts>Date.now()||Date.now()-data.ts>=8*3600000)return null;return data;}catch{return null;}}
export async function staffIdentity(req,env=process.env){const p=await signedPayload(cookieValue(req,'adb_session'),env);return p&&['owner','cousin','staff'].includes(p.role)?p:null;}
export async function customerIdentity(req,env=process.env){
 const secure=new URL(env.AMES_APP_ORIGIN||req.url).protocol==='https:',token=cookieValue(req,secure?'__Host-ames_customer':'ames_customer');if(!token)return null;
 if(token.length>2048||!/^[A-Za-z0-9._~+/=-]+$/.test(token))return null;
 const endpoint=env.APPWRITE_ENDPOINT?.trim(),project=env.APPWRITE_PROJECT_ID?.trim();if(!endpoint||!project)throw new Error('Identity unavailable');
 const response=await fetch(endpoint+'/account',{headers:{'X-Appwrite-Project':project,'X-Appwrite-Session':token},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
 if([401,403,404].includes(response.status))return null;if(!response.ok)throw new Error('Identity unavailable');const u=await response.json();if(!u.status)return null;
 const digest=await crypto.subtle.digest('SHA-256',enc.encode(JSON.stringify([u.$id]))),id=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('').slice(0,36);
 const profile=await fetch(`${endpoint}/tablesdb/${encodeURIComponent(env.APPWRITE_DATABASE_ID||'ames')}/tables/${encodeURIComponent(env.APPWRITE_COLLECTION_PROFILES||'user_profiles')}/rows/${id}`,{headers:{'X-Appwrite-Project':project,'X-Appwrite-Key':env.APPWRITE_API_KEY||''},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(profile.ok){if(JSON.parse((await profile.json()).payload).accountState==='disabled')return null;}else if(profile.status!==404)throw new Error('Identity unavailable');
 return {id:u.$id,admin:u.labels?.includes('amesadmin')===true};
}
export async function portalIdentity(req,kind,env=process.env){const p=await signedPayload(cookieValue(req,'ames_'+kind),env);if(p?.kind!==kind||typeof p.id!=='string'||typeof p.code!=='string'||!['model','trader'].includes(kind))return null;
 const r=await fetch(`${env.APPWRITE_ENDPOINT}/tablesdb/${encodeURIComponent(env.APPWRITE_DATABASE_ID||'ames')}/tables/${kind==='model'?'models':'traders'}/rows/${encodeURIComponent(p.id)}`,{headers:{'X-Appwrite-Project':env.APPWRITE_PROJECT_ID||'','X-Appwrite-Key':env.APPWRITE_API_KEY||''},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});if(r.status===404)return null;if(!r.ok)throw new Error('Portal unavailable');const entity=await r.json();return entity.status==='Active'&&entity.portal_code===p.code?p:null;}
export async function portalCookie(req,kind,entity,env=process.env){const data={kind,id:entity.id,code:entity.portal_code,ts:Date.now()},raw=JSON.stringify(data);const token=b64(enc.encode(raw))+'.'+b64(await crypto.subtle.sign('HMAC',await key(env),enc.encode(raw)));return `ames_${kind}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${new URL(env.AMES_APP_ORIGIN||req.url).protocol==='https:'?'; Secure':''}`;}
export function sameOrigin(req,env=process.env){const expected=env.AMES_APP_ORIGIN||new URL(req.url).origin;return req.headers.get('origin')===expected;}
