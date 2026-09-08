import {Client,Storage,TablesDB,Query} from 'node-appwrite';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {customerConfig} from '../src/lib/customer/config.mjs';
const c=customerConfig(),client=new Client().setEndpoint(c.endpoint).setProject(c.project).setKey(c.key),storage=new Storage(client),db=new TablesDB(client);
const report={storage:{},legacy:[]};
function failure(e){return {code:e.code||null,type:e.type||e.cause?.code||e.name};}
async function files(dir){return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]))).flat();}
try{
 const b=await storage.listBuckets({queries:[Query.limit(100)]});
 report.storage={count:b.total,buckets:b.buckets.map(v=>({id:v.$id,name:v.name,permissions:v.$permissions,fileSecurity:v.fileSecurity})),planned:Object.values(c.buckets),accountQuota:'not exposed by project Storage API',publishedFreePlanBucketLimit:1,source:'https://appwrite.io/changelog/entry/2026-04-07'};
 // Inspection precedes the one permitted creation attempt. Stop immediately on quota denial.
 if(process.argv.includes('--probe-create')){const missing=Object.values(c.buckets).find(id=>!b.buckets.some(v=>v.$id===id));if(missing){try{await storage.createBucket({bucketId:missing,name:missing,permissions:[],fileSecurity:true,enabled:true,maximumFileSize:50*1024*1024,allowedFileExtensions:['glb'],encryption:true,antivirus:true});report.storage.created=missing;}catch(e){report.storage.creation=failure(e);report.storage.canCreateFour=false;report.storage.stopped=true;}}}
 const sources=await Promise.all((await files('src')).filter(p=>/\.[cm]?[jt]sx?$/.test(p)&&!p.replaceAll('\\','/').endsWith('/lib/appwrite.ts')).map(async path=>({path:path.replaceAll('\\','/'),lines:(await readFile(path,'utf8')).split('\n')})));
 const all=await db.listTables({databaseId:c.database,queries:[Query.limit(100)]});
 for(const t of all.tables.filter(t=>!Object.values(c.collections).includes(t.$id))){const references=[];for(const f of sources){for(let i=0;i<f.lines.length;i++)if(f.lines[i].includes('"'+t.$id+'"')||f.lines[i].includes("'"+t.$id+"'"))references.push({file:f.path,line:i+1});}report.legacy.push({id:t.$id,name:t.name,permissions:t.$permissions,rowSecurity:t.rowSecurity,appearsReferenced:references.length>0,references});}
}catch(e){report.error=failure(e);process.exitCode=1;}
await mkdir('outputs',{recursive:true});await writeFile('outputs/storage-legacy-review.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,legacy:report.legacy.map(({references,...v})=>({...v,referenceCount:references.length}))}));
