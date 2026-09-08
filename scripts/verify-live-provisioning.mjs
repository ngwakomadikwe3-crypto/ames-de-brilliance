import {Client,TablesDB,Storage,Users,Query} from 'node-appwrite';
import {customerConfig} from '../src/lib/customer/config.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const c=customerConfig(),client=new Client().setEndpoint(c.endpoint).setProject(c.project).setKey(c.key),db=new TablesDB(client),storage=new Storage(client),report={liveAppwrite:true,database:false,tables:[],buckets:[],checks:{}};
async function check(operation,fn){for(let attempt=0;attempt<3;attempt++){try{return await fn();}catch(e){if(attempt<2&&['UND_ERR_CONNECT_TIMEOUT','ECONNRESET','ETIMEDOUT'].includes(e.cause?.code))continue;return {operation,code:e.code||null,type:e.type||e.cause?.code||e.name,missingScope:String(e.message).match(/missing scopes? \(([^)]+)\)/i)?.[1]};}}}
report.database=await check('database',async()=>{await db.get({databaseId:c.database});return true;});
for(const tableId of Object.values(c.collections)){report.tables.push(await check(tableId,async()=>{const p={databaseId:c.database,tableId},t=await db.getTable(p),columns=(await db.listColumns(p)).columns,indexes=(await db.listIndexes(p)).indexes;return {tableId,private:t.$permissions.length===0,rowSecurity:t.rowSecurity,columns:columns.map(a=>({key:a.key,required:a.required,size:a.size,status:a.status})),indexes:indexes.map(i=>({key:i.key,columns:i.columns,status:i.status})),ready:columns.length===5&&columns.every(a=>a.status==='available')&&indexes.length===4&&indexes.every(i=>i.status==='available')};}));}
for(const bucketId of Object.values(c.buckets))report.buckets.push(await check(bucketId,async()=>{const b=await storage.getBucket({bucketId});return {bucketId,private:b.$permissions.length===0,fileSecurity:b.fileSecurity,enabled:b.enabled};}));
report.checks.userInspection=await check('users.read',async()=>{await new Users(client).list({queries:[Query.limit(1)]});return true;});
const guestDb=new TablesDB(new Client().setEndpoint(c.endpoint).setProject(c.project));report.checks.anonymousPrivateRows=[];
for(const tableId of Object.values(c.collections)){
 const p={databaseId:c.database,tableId,rowId:randomUUID()},entry={tableId};let created=false;
 try{await db.createRow({...p,data:{userId:'ames-security-probe',assetId:'',kind:'qa',payload:'{}',updatedAt:new Date().toISOString()},permissions:[]});created=true;
  const listed=await guestDb.listRows({databaseId:c.database,tableId,queries:[Query.limit(1)]});entry.noRowsExposed=listed.rows.length===0;
  try{await guestDb.getRow(p);entry.directReadRejected=false;}catch(e){entry.directReadRejected=[401,403,404].includes(e.code);entry.readStatus=e.code;}
  try{await guestDb.updateRow({...p,data:{kind:'unauthorized-probe'}});entry.directWriteRejected=false;}catch(e){entry.directWriteRejected=[401,403,404].includes(e.code);entry.writeStatus=e.code;}
 }catch(e){entry.error={code:e.code||null,type:e.type||e.cause?.code||e.name};}
 finally{if(created){try{await db.deleteRow(p);entry.probeRemoved=true;}catch(e){entry.probeRemoved=false;entry.remainingProbeId=p.rowId;}}}
 report.checks.anonymousPrivateRows.push(entry);
}
report.checks.legacyPermissions=await check('legacyPermissions',async()=>{const all=(await db.listTables({databaseId:c.database,queries:[Query.limit(100)]})).tables.filter(t=>!Object.values(c.collections).includes(t.$id));const buckets=(await storage.listBuckets()).buckets;return {tables:all.length,guestReadable:all.filter(t=>t.$permissions.includes('read("any")')).length,guestWritable:all.filter(t=>t.$permissions.some(p=>/^(create|update|delete|write)\("any"\)$/.test(p))).length,publicReadBuckets:buckets.filter(b=>b.$permissions.includes('read("any")')).map(b=>b.$id)};});
await mkdir('outputs',{recursive:true});await writeFile('outputs/live-appwrite-provisioning.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
