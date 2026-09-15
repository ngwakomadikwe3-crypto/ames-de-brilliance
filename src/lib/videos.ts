import {Query} from 'node-appwrite';
import {getDb,getStorage,DB_ID,MEDIA_BUCKET,doc} from './appwrite';
import {customerIdentity,sameOrigin} from './legacy-auth.mjs';
import {customerConfig} from './customer/config.mjs';
import {createAppwriteGateway,documentId} from './customer/appwrite.mjs';
import {createVideoService} from './video-service.mjs';
const path={databaseId:DB_ID,collectionId:'videos'};
export const videoGateway={identity:customerIdentity,sameOrigin,
 async audit(event:any){await createAppwriteGateway(customerConfig()).put('events',crypto.randomUUID(),{kind:'VIDEO_PUBLICATION',...event});},
 async list(){const rows:any[]=[];let cursor:string|undefined;do{const batch:any=await getDb().listDocuments({...path,queries:[Query.limit(100),...(cursor?[Query.cursorAfter(cursor)]:[])]});rows.push(...batch.documents.map((d:any)=>doc<any>(d)));if(batch.documents.length<100)return rows;cursor=batch.documents.at(-1)!.$id;}while(rows.length<5000);throw new Error('Video pagination limit');},
 async get(id:string){try{return doc<any>(await getDb().getDocument({...path,documentId:id}));}catch(e:any){if(e.code===404)return null;throw e;}},
 async save(id:string,data:any,create:boolean){if(create)await getDb().createDocument({...path,documentId:id,data,permissions:[]});else await getDb().updateDocument({...path,documentId:id,data});},
 async remove(id:string){await getDb().deleteDocument({...path,documentId:id});},
 async file(id:string){return getStorage().getFile({bucketId:MEDIA_BUCKET,fileId:id});},
 async product(id:string){return createAppwriteGateway(customerConfig()).get('catalog',documentId(id));}
};
export const videoService=createVideoService(videoGateway);
