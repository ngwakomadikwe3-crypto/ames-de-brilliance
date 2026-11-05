import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { Query, DatabasesIndexType } from 'node-appwrite';
import { getDb, DB_ID } from './appwrite';
import { z } from 'zod';
export type Activity<T = Record<string, unknown>> = { id: string; kind: 'reaction' | 'comment' | 'report' | 'cart' | 'purchase' | 'reservation'; owner: string; subject: string; status: string; createdAt: string; data: T };
const collectionId = 'account_activity';
const local = () => !process.env.VERCEL && process.env.AMES_ACTIVITY_STORAGE !== 'appwrite';
const root = () => resolve(/* turbopackIgnore: true */ process.env.AMES_ACTIVITY_ROOT || join(process.env.LOCALAPPDATA || homedir(), 'AMES', 'private-activity'));
export function activityId(namespace: string, identity: string) { const b=createHash('sha256').update(namespace+':'+identity).digest().subarray(0,16);b[6]=(b[6]&15)|80;b[8]=(b[8]&63)|128;const h=b.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`; }
let ready: Promise<void> | undefined;
async function provision() {
 const db=getDb(),base={databaseId:DB_ID,collectionId};
 try { await db.getCollection(base); } catch(e) { if((e as {code?:number}).code!==404)throw e;try{await db.createCollection({...base,name:'Private account activity',permissions:[],documentSecurity:false});}catch(c){if((c as {code?:number}).code!==409)throw c;} }
 await db.updateCollection({...base,name:'Private account activity',permissions:[],documentSecurity:false});
 const attrs=await db.listAttributes(base);
 for(const [key,size] of Object.entries({kind:30,owner:100,subject:180,status:30,payload:65535,created_at:0}))if(!attrs.attributes.some(a=>a.key===key))try{if(size)await db.createStringAttribute({...base,key,size,required:false});else await db.createDatetimeAttribute({...base,key,required:false});}catch(e){if((e as {code?:number}).code!==409)throw e;}
 for(let i=0;;i++){const a=await db.listAttributes(base);if(['kind','owner','subject','status','payload','created_at'].every(k=>a.attributes.some(v=>v.key===k&&v.status==='available')))break;if(i>40)throw Error('Account activity storage is preparing. Retry shortly.');await new Promise(r=>setTimeout(r,200));}
 const names:string[]=[];
 for(let mask=0;mask<8;mask++){const attributes=['kind',...['owner','subject','status'].filter((_,i)=>mask&(1<<i)),'created_at'],key='activity_'+mask;names.push(key);try{await db.createIndex({...base,key,type:DatabasesIndexType.Key,attributes});}catch(e){if((e as {code?:number}).code!==409)throw e;}}
 for(let i=0;;i++){const a=await db.listIndexes(base);if(names.every(k=>a.indexes.some(v=>v.key===k&&v.status==='available')))break;if(i>40)throw Error('Account activity indexes are preparing. Retry shortly.');await new Promise(r=>setTimeout(r,200));}
}
async function ensure(){if(local()){await mkdir(root(),{recursive:true,mode:0o700});return;}if(!ready)ready=provision().catch(e=>{ready=undefined;throw e;});await ready;}
export async function readActivity<T>(id:string):Promise<Activity<T>|null>{z.uuid().parse(id);await ensure();try{return local()?JSON.parse(await readFile(join(root(),id+'.json'),'utf8')):JSON.parse((await getDb().getDocument({databaseId:DB_ID,collectionId,documentId:id})).payload);}catch(e){if((e as {code?:string|number}).code==='ENOENT'||(e as {code?:number}).code===404)return null;throw e;}}
export async function writeActivity<T>(record:Activity<T>,create=false){z.uuid().parse(record.id);await ensure();const payload=JSON.stringify(record);if(payload.length>64000)throw Error('Record size limit reached');
 if(local()){const target=join(root(),record.id+'.json');if(create)await writeFile(target,payload,{mode:0o600,flag:'wx'});else{const temp=target+'.'+randomUUID()+'.tmp';await writeFile(temp,payload,{mode:0o600});try{await rename(temp,target);}finally{await unlink(temp).catch(()=>{});}}}
 else{const input={databaseId:DB_ID,collectionId,documentId:record.id,data:{kind:record.kind,owner:record.owner,subject:record.subject,status:record.status,created_at:record.createdAt,payload}};if(create)await getDb().createDocument({...input,permissions:[]});else try{await getDb().updateDocument(input);}catch(e){if((e as {code?:number}).code!==404)throw e;try{await getDb().createDocument({...input,permissions:[]});}catch(c){if((c as {code?:number}).code!==409)throw c;await getDb().updateDocument(input);}}}return record;}
export async function deleteActivity(id:string){z.uuid().parse(id);await ensure();if(local())await unlink(join(root(),id+'.json'));else await getDb().deleteDocument({databaseId:DB_ID,collectionId,documentId:id});}
export async function listActivity<T>(kind:Activity['kind'],filter:{owner?:string;subject?:string;status?:string|string[]},limit=50,cursor?:string){await ensure();if(cursor)z.uuid().parse(cursor);limit=Math.min(100,Math.max(1,limit));
 if(local()){let all=(await Promise.all((await readdir(root())).filter(f=>/^[a-f0-9-]{36}\.json$/.test(f)).map(async f=>JSON.parse(await readFile(join(root(),f),'utf8')) as Activity<T>))).filter(r=>r.kind===kind&&Object.entries(filter).every(([k,v])=>Array.isArray(v)?v.includes(r[k as keyof Activity] as string):r[k as keyof Activity]===v)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));const total=all.length;if(cursor){const at=all.findIndex(r=>r.id===cursor);all=at<0?[]:all.slice(at+1);}const records=all.slice(0,limit);return{records,total,next:all.length>limit?records.at(-1)!.id:null};}
 const page=await getDb().listDocuments({databaseId:DB_ID,collectionId,queries:[Query.equal('kind',kind),...Object.entries(filter).map(([k,v])=>Query.equal(k,Array.isArray(v)?v:v)),Query.orderDesc('created_at'),Query.limit(limit),...(cursor?[Query.cursorAfter(cursor)]:[])]});const records=page.documents.map(d=>JSON.parse(d.payload) as Activity<T>);return{records,total:page.total,next:records.length===limit?records.at(-1)!.id:null};}
