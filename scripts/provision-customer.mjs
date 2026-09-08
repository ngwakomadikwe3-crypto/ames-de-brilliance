import {Client,Storage} from 'node-appwrite';
import {customerConfig} from '../src/lib/customer/config.mjs';
import {customerDatabase} from '../src/lib/customer/database.mjs';
const config=customerConfig();
const plan={database:config.database,collections:config.collections,buckets:config.buckets,permissions:[],documentSecurity:true,fileSecurity:true};
if(!process.argv.includes('--apply')){console.log(JSON.stringify({mode:'dry-run',...plan},null,2));process.exit(0);}
if(!config.endpoint||!config.project||!process.env.APPWRITE_PROVISION_KEY)throw new Error('Supply APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID and APPWRITE_PROVISION_KEY. No resources changed.');
const client=new Client().setEndpoint(config.endpoint).setProject(config.project).setKey(process.env.APPWRITE_PROVISION_KEY),db=customerDatabase(client),storage=new Storage(client);
async function create(fn){try{return await fn();}catch(e){if(e.code!==409)throw e;}}
try{await db.get({databaseId:config.database});}catch(e){if(e.code!==404)throw e;await db.create({databaseId:config.database,name:'AMES'});}
for(const collectionId of Object.values(config.collections)){
 const base={databaseId:config.database,collectionId};
 try{await db.getCollection(base);}catch(e){if(e.code!==404)throw e;await db.createCollection({...base,name:collectionId,permissions:[],documentSecurity:true});}
 const existing=await db.getCollection(base);if(existing.$permissions.length||!existing.documentSecurity)throw new Error(`Unsafe existing collection ${collectionId}; export and migrate its permissions before retrying.`);
 const beforeColumns=(await db.listAttributes(base)).attributes;
 for(const [key,size] of [['userId',128],['assetId',128],['kind',64],['payload',60000]])if(!beforeColumns.some(a=>a.key===key))await create(()=>db.createStringAttribute({...base,key,size,required:true}));
 if(!beforeColumns.some(a=>a.key==='updatedAt'))await create(()=>db.createDatetimeAttribute({...base,key:'updatedAt',required:true}));
 let ready=false;
 for(let i=0;i<60;i++){const result=await db.listAttributes(base);if(result.attributes.some(a=>a.status==='failed'))throw new Error(`Attribute failed: ${collectionId}`);if(result.attributes.length>=5&&result.attributes.every(a=>a.status==='available')){ready=true;break;}await new Promise(r=>setTimeout(r,1000));}
 if(!ready)throw new Error(`Attributes still building: ${collectionId}; rerun when available.`);
 const schema=(await db.listAttributes(base)).attributes;
 for(const [key,size] of [['userId',128],['assetId',128],['kind',64],['payload',60000]]){const a=schema.find(a=>a.key===key);if(!a?.required||a.size!==size)throw new Error(`Incompatible attribute ${collectionId}.${key}; explicit migration required.`);}
 const beforeIndexes=(await db.listIndexes(base)).indexes;
 for(const key of ['userId','assetId','kind','updatedAt'])if(!beforeIndexes.some(i=>i.key===`by_${key}`))await create(()=>db.createIndex({...base,key:`by_${key}`,type:'key',attributes:[key]}));
 let indexed=false;for(let i=0;i<60;i++){const result=await db.listIndexes(base);if(result.indexes.some(a=>a.status==='failed'))throw new Error(`Index failed: ${collectionId}`);if(['userId','assetId','kind','updatedAt'].every(k=>result.indexes.some(a=>a.key===`by_${k}`&&a.status==='available'&&a.attributes.length===1&&a.attributes[0]===k))){indexed=true;break;}await new Promise(r=>setTimeout(r,1000));}
 if(!indexed)throw new Error(`Indexes not ready: ${collectionId}`);
 console.log('Ready table '+collectionId);
}
if(process.argv.includes('--skip-storage')){console.log('Database verified. Storage skipped because its quota check is handled separately.');process.exit(0);}
for(const [kind,bucketId] of Object.entries(config.buckets)){
 try{await storage.getBucket({bucketId});}catch(e){if(e.code!==404)throw e;await storage.createBucket({bucketId,name:bucketId,permissions:[],fileSecurity:true,enabled:true,maximumFileSize:50*1024*1024,allowedFileExtensions:kind==='previews'?['png','jpg','jpeg','webp']:['glb'],encryption:true,antivirus:true});}
 const b=await storage.getBucket({bucketId});if(b.$permissions.length||!b.fileSecurity)throw new Error(`Unsafe existing bucket ${bucketId}; explicit migration required.`);
 console.log('Ready private bucket '+bucketId);
}
console.log('Provisioning complete; attributes and indexes ready. No users or entitlement grants created.');
