import {Client,Databases,Storage,TablesDB} from 'node-appwrite';
import {customerConfig} from '../src/lib/customer/config.mjs';
const c=customerConfig(),client=new Client().setEndpoint(c.endpoint).setProject(c.project).setKey(c.key),db=new Databases(client);
console.log(JSON.stringify({configuredVariableNames:Object.keys(process.env).filter(k=>/APPWRITE|AMES_APP|DELIVERY/.test(k)),databaseId:c.database}));
async function probe(operation,fn){try{console.log(JSON.stringify({operation,ok:true,result:await fn()}));}catch(e){const scope=String(e.message).match(/missing scopes? \(([^)]+)\)/i)?.[1];console.log(JSON.stringify({operation,ok:false,code:e.code||null,type:e.type||e.cause?.code||'transport_error',missingScope:scope}));}}
await probe('database.get',async()=>{const d=await db.get({databaseId:c.database});return {id:d.$id,name:d.name};});
await probe('database.list',async()=>{const r=await db.list();return r.databases.map(d=>({id:d.$id,name:d.name}));});
await probe('collections.list',async()=>{const r=await db.listCollections({databaseId:c.database});return r.collections.map(v=>({id:v.$id,private:v.$permissions.length===0,documentSecurity:v.documentSecurity}));});
await probe('buckets.list',async()=>{const r=await new Storage(client).listBuckets();return r.buckets.map(b=>({id:b.$id,private:b.$permissions.length===0,fileSecurity:b.fileSecurity}));});
await probe('tables.list',async()=>{const r=await new TablesDB(client).listTables({databaseId:c.database});return r.tables.map(t=>({id:t.$id,private:t.$permissions.length===0,rowSecurity:t.rowSecurity}));});
await probe('profile.columns',async()=>{const r=await new TablesDB(client).listColumns({databaseId:c.database,tableId:c.collections.profiles});return r.columns.map(a=>({key:a.key,size:a.size,required:a.required,status:a.status,type:a.type}));});
