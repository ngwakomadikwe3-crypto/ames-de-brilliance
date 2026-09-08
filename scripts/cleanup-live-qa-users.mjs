import {Client,Users,Query} from 'node-appwrite';
import {customerConfig} from '../src/lib/customer/config.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const c=customerConfig(),users=new Users(new Client().setEndpoint(c.endpoint).setProject(c.project).setKey(c.key));
const runs=new Set(['qa-2af34d09','qa-8a0ea479','qa-7b22b82d','qa-a2127cc8']);try{runs.add(JSON.parse(await readFile('outputs/live-appwrite-e2e.json','utf8')).runId);}catch{}
const report={qaUsers:[],deleted:0,sessionsRevoked:0,errors:[]};let deleteAllowed=true,revokeAllowed=true;
const info=(operation,e)=>({operation,code:e.code||null,type:e.type||e.cause?.code||e.name,missingScope:String(e.message).match(/missing scopes? \(([^)]+)\)/i)?.[1]});
try{for(const run of runs){if(!/^qa-[a-f0-9]{8}$/.test(run))throw new Error('Invalid QA run identifier');for(let i=0;i<2;i++){
 const email=`${run}-${i}@example.test`;const found=await users.list({queries:[Query.equal('email',email)]});
 for(const u of found.users){if(u.email!==email||u.name!=='AMES temporary live QA')throw new Error('QA identity guard failed');const record={run,userId:u.$id,deleted:false,sessionsRevoked:false};report.qaUsers.push(record);
  if(revokeAllowed){try{await users.deleteSessions({userId:u.$id});record.sessionsRevoked=true;report.sessionsRevoked++;}catch(e){report.errors.push(info('revokeQaSessions',e));if(e.type==='general_unauthorized_scope')revokeAllowed=false;}}
  if(deleteAllowed){try{await users.delete({userId:u.$id});record.deleted=true;report.deleted++;}catch(e){report.errors.push(info('deleteQaUser',e));if(e.type==='general_unauthorized_scope')deleteAllowed=false;}}
 }
}}}catch(e){report.errors.push(info('qaDiscovery',e));process.exitCode=1;}
report.remaining=report.qaUsers.filter(u=>!u.deleted).length;await mkdir('outputs',{recursive:true});await writeFile('outputs/live-qa-cleanup.json',JSON.stringify(report,null,2));console.log(JSON.stringify({found:report.qaUsers.length,deleted:report.deleted,remaining:report.remaining,sessionsRevoked:report.sessionsRevoked,errors:report.errors}));
