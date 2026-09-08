import {Client,TablesDB,Storage,Query} from 'node-appwrite';
import {readFile,writeFile,access} from 'node:fs/promises';
import {customerConfig} from '../src/lib/customer/config.mjs';
const c=customerConfig(),client=new Client().setEndpoint(c.endpoint).setProject(c.project).setKey(c.key),db=new TablesDB(client),storage=new Storage(client);
const names=['traders','stones','requests','orders','reports','stone_status_log','models','videos','comments','chats','chat_messages','report_issues','report_products','report_orders','staff','usage_log','balances'];
const expected=['read("any")','create("any")','update("any")','delete("any")'];
const report={at:new Date().toISOString(),apply:process.argv.includes('--apply'),tables:[],storage:{},changes:[]};
async function persist(){await writeFile('outputs/final-security-migration.json',JSON.stringify(report,null,2));}
async function ready(fn){for(let i=0;i<60;i++){const v=await fn();if(v.status==='available')return;if(v.status==='failed')throw Object.assign(new Error(),{type:'schema_build_failed'});await new Promise(r=>setTimeout(r,1000));}throw Object.assign(new Error(),{type:'schema_pending'});}
try{
 await access('docs/FINAL_SECURITY_MIGRATION_PLAN.md');const audit=JSON.parse(await readFile('outputs/final-security-audit.json','utf8'));if(audit.error||audit.tables.length!==17)throw Object.assign(new Error(),{type:'incomplete_audit'});
 // Preflight every table and every existing row ACL before applying any change.
 for(const tableId of names){const p={databaseId:c.database,tableId},t=await db.getTable(p);if(t.$permissions.length&&JSON.stringify(t.$permissions)!==JSON.stringify(expected))throw Object.assign(new Error(),{type:'unexpected_table_acl'});let cursor,count=0;do{const r=await db.listRows({...p,queries:[Query.limit(100),Query.select(['$id','$permissions']),...(cursor?[Query.cursorAfter(cursor)]:[])]});if(r.rows.some(v=>v.$permissions.length))throw Object.assign(new Error(),{type:'unexpected_row_acl'});count+=r.rows.length;if(r.rows.length<100)break;cursor=r.rows.at(-1).$id;}while(true);report.tables.push({id:tableId,name:t.name,permissions:t.$permissions,rowSecurity:t.rowSecurity,rows:count});}
 const buckets=await storage.listBuckets({queries:[Query.limit(100)]}),bucket=await storage.getBucket({bucketId:'media'}),files=await storage.listFiles({bucketId:'media',queries:[Query.limit(1)]});report.storage={bucketCount:buckets.total,bucketNames:buckets.buckets.map(b=>b.name),before:{permissions:bucket.$permissions,fileSecurity:bucket.fileSecurity,extensions:bucket.allowedFileExtensions,maximumFileSize:bucket.maximumFileSize},files:files.total};
 await persist();if(!report.apply){console.log(JSON.stringify(report));process.exit(0);}
 // Reuse private tables. Enabling row security with empty row ACLs preserves only server access.
 for(const t of report.tables){if(t.permissions.length||!t.rowSecurity){await db.updateTable({databaseId:c.database,tableId:t.id,name:t.name,permissions:[],rowSecurity:true});report.changes.push('private_table:'+t.id);await persist();}const v=await db.getTable({databaseId:c.database,tableId:t.id});if(v.$permissions.length||!v.rowSecurity)throw Object.assign(new Error(),{type:'table_verification_failed'});t.verifiedPrivate=true;}
 const base={databaseId:c.database,tableId:'chats'},cols=await db.listColumns({...base,queries:[Query.limit(100)]});
 if(!cols.columns.some(v=>v.key==='userId')){await db.createStringColumn({...base,key:'userId',size:128,required:false});report.changes.push('chats.userId');await persist();}
 await ready(()=>db.getColumn({...base,key:'userId'}));
 const indexes=await db.listIndexes({...base,queries:[Query.limit(100)]});if(!indexes.indexes.some(v=>v.key==='by_userId')){await db.createIndex({...base,key:'by_userId',type:'key',columns:['userId']});report.changes.push('chats.by_userId');await persist();}await ready(()=>db.getIndex({...base,key:'by_userId'}));
 // No creation, deletion or upgrade. Refuse to modify a populated bucket automatically.
 const current=await storage.getBucket({bucketId:'media'}),fresh=await storage.listFiles({bucketId:'media',queries:[Query.limit(1)]});
 if(fresh.total!==0){report.storage.blocker='STORAGE_COMPATIBILITY_REVIEW_REQUIRED: files appeared; bucket unchanged';}
 else if(current.$permissions.length&&JSON.stringify(current.$permissions)!==JSON.stringify(expected)){report.storage.blocker='STORAGE_COMPATIBILITY_REVIEW_REQUIRED: unexpected bucket ACL';}
 else{await storage.updateBucket({bucketId:'media',name:current.name,permissions:[],fileSecurity:true,enabled:current.enabled,maximumFileSize:current.maximumFileSize,allowedFileExtensions:[...new Set([...current.allowedFileExtensions,'glb','mp4','webm','mov'])],compression:current.compression,encryption:current.encryption,antivirus:current.antivirus});report.changes.push('media_private_file_security');const v=await storage.getBucket({bucketId:'media'});report.storage.after={permissions:v.$permissions,fileSecurity:v.fileSecurity,extensions:v.allowedFileExtensions,maximumFileSize:v.maximumFileSize};report.storage.verifiedPrivate=!v.$permissions.length&&v.fileSecurity;if(!report.storage.verifiedPrivate)throw Object.assign(new Error(),{type:'storage_verification_failed'});}
}catch(e){report.error={code:e.code||null,type:e.type||e.cause?.code||e.name};process.exitCode=1;}
await persist();console.log(JSON.stringify({...report,tables:report.tables.map(({permissions,...t})=>t)}));
