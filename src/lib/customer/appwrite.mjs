import {InputFile} from 'node-appwrite/file';
import { Client, Account, Storage, Query, Users } from 'node-appwrite';
import { createHash, randomUUID } from 'node:crypto';
import { assertConfigured } from './config.mjs';
import {customerDatabase} from './database.mjs';
export const documentId=(...values)=>createHash('sha256').update(JSON.stringify(values)).digest('hex').slice(0,36);
export function createAppwriteGateway(config) {
  assertConfigured(config);
  const client=()=>new Client().setEndpoint(config.endpoint).setProject(config.project);
  const admin=client().setKey(config.key), db=customerDatabase(admin),storage=new Storage(admin);
  const account=session=>new Account(client().setSession(session));
  const collection=k=>config.collections[k];
  const unpack=d=>({id:d.kind==='JEWELLER_INVENTORY'&&d.assetId?d.assetId:d.$id,userId:d.userId,assetId:d.assetId,kind:d.kind,...JSON.parse(d.payload)});
  const path=k=>({databaseId:config.database,collectionId:collection(k)});
  return {
    async accounts(){const rows=[];let cursor;do{const batch=await new Users(admin).list({queries:[Query.limit(100),...(cursor?[Query.cursorAfter(cursor)]:[])]});rows.push(...batch.users.map(u=>({id:u.$id,name:u.name,email:u.email,status:u.status,labels:u.labels,createdAt:u.$createdAt})));if(batch.users.length<100)return rows;cursor=batch.users.at(-1).$id;}while(rows.length<5000);throw new Error('Account directory pagination limit');},
    async login(email,password){return new Account(admin).createEmailPasswordSession({email,password});},
    async register(email,password,name){return new Account(client()).create({userId:randomUUID(),email,password,name});},
    async user(session){return account(session).get();},
    async logout(session){await account(session).deleteSession({sessionId:'current'});},
    async get(k,id){try{return unpack(await db.getDocument({...path(k),documentId:id}));}catch(e){if(e.code===404)return null;throw e;}},
    async list(k,filters={}){
      const rows=[];let cursor;
      do {const queries=[Query.limit(100),...Object.entries(filters).map(([key,value])=>Query.equal(key,value))];if(cursor)queries.push(Query.cursorAfter(cursor));
        const batch=await db.listDocuments({...path(k),queries});rows.push(...batch.documents.map(unpack));
        if(batch.documents.length<100)return rows;cursor=batch.documents.at(-1).$id;
        if(rows.length>=5000)throw Object.assign(new Error('Collection needs pagination'),{status:503});
      }while(true);
    },
    async put(k,id,data,createOnly=false){
      const {userId='',assetId='',kind='',...payload}=data;
      const row={userId,assetId,kind,payload:JSON.stringify(payload),updatedAt:new Date().toISOString()};
      if(row.payload.length>60000)throw Object.assign(new Error('Record too large'),{status:400});
      try {await db.createDocument({...path(k),documentId:id,data:row,permissions:[]});}
      catch(e){if(e.code!==409||createOnly)throw e;await db.updateDocument({...path(k),documentId:id,data:row});}
      return {id,...data};
    },
    async remove(k,id){try{await db.deleteDocument({...path(k),documentId:id});}catch(e){if(e.code!==404)throw e;}},
    async uploadMedia({bytes,name,bucketId}){
      const bucket=await storage.getBucket({bucketId});if(!bucket.enabled||!bucket.fileSecurity||bucket.$permissions?.length)throw Object.assign(new Error('Private media storage required'),{status:503});if(bytes.length>Math.min(bucket.maximumFileSize,4*1024*1024))throw Object.assign(new Error('File exceeds storage limit'),{status:413});
      return storage.createFile({bucketId,fileId:randomUUID(),file:InputFile.fromBuffer(bytes,name),permissions:[]});
    },
    async fileInfo(ref){return storage.getFile({bucketId:ref.bucketId,fileId:ref.fileId});},
    async stream(ref,signal,range){
      const [bucket,file]=await Promise.all([storage.getBucket({bucketId:ref.bucketId}),storage.getFile({bucketId:ref.bucketId,fileId:ref.fileId})]);
      if(!bucket.enabled||!bucket.fileSecurity||bucket.$permissions?.length||file.$permissions?.length)throw Object.assign(new Error('Asset storage permissions are unsafe'),{status:503});
      if(range&&!/^bytes=\d*-\d*$/.test(range))throw Object.assign(new Error('Invalid byte range'),{status:416});
      const response=await fetch(`${config.endpoint}/storage/buckets/${encodeURIComponent(ref.bucketId)}/files/${encodeURIComponent(ref.fileId)}/download`,{headers:{'X-Appwrite-Project':config.project,'X-Appwrite-Key':config.key,...(range?{Range:range}:{})},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000),redirect:'error',cache:'no-store'});
      if(!response.ok)throw Object.assign(new Error('Asset unavailable'),{status:503});
      return response;
    },
    async health(){
      for(const id of Object.values(config.collections)){const c=await db.getCollection({databaseId:config.database,collectionId:id});if(c.$permissions?.length||!c.documentSecurity)throw new Error('Unsafe collection permissions');}
      for(const id of Object.values(config.buckets)){const b=await storage.getBucket({bucketId:id});if(b.$permissions?.length||!b.fileSecurity||!b.enabled)throw new Error('Unsafe bucket permissions');}
      return true;
    },
  };
}
