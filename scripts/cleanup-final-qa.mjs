import {Client,Users} from 'node-appwrite';
import {customerConfig} from '../src/lib/customer/config.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const inventory=[['qa-2af34d09','fb76f752-715d-400b-9c70-e6cb75bc60b6'],['qa-8a0ea479','96d8162b-8a8f-4f41-bd0a-a4e68e53dcfd'],['qa-7b22b82d','b7b7156b-95d3-4f9e-8fa1-58a1cfbae99c'],['qa-a2127cc8','ee944f9b-a98a-4d7a-8527-8a0d9feda673'],['qa-a6c7056a','cc205042-46e8-41fb-9110-6236afe43a79'],['qa-a6c7056a','cdfbe11e-1e81-4226-8e28-2040d68caba3']];
const c=customerConfig(),users=new Users(new Client().setEndpoint(c.endpoint).setProject(c.project).setKey(c.key));
const report={qaUsers:[],deleted:0,verifiedAbsent:0,errors:[]};
for(const [run,userId] of inventory){const record={run,userId};report.qaUsers.push(record);try{
 let u;try{u=await users.get({userId});}catch(e){if(e.code===404){record.alreadyAbsent=true;record.verifiedAbsent=true;report.verifiedAbsent++;continue;}throw e;}
 if(u.name!=='AMES temporary live QA'||![`${run}-0@example.test`,`${run}-1@example.test`].includes(u.email))throw Object.assign(new Error(),{type:'qa_identity_guard_failed'});
 await users.deleteSessions({userId});await users.delete({userId});record.deleted=true;report.deleted++;
 try{await users.get({userId});throw Object.assign(new Error(),{type:'qa_still_exists'});}catch(e){if(e.code!==404)throw e;record.verifiedAbsent=true;report.verifiedAbsent++;}
}catch(e){report.errors.push({userId,code:e.code||null,type:e.type||e.cause?.code||e.name});process.exitCode=1;}}
report.remaining=inventory.length-report.verifiedAbsent;await mkdir('outputs',{recursive:true});await writeFile('outputs/final-qa-cleanup.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
