/** Local asset briefs and inspection. Never publishes, uploads or approves a product. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {newAssetBrief,assessBrief,evaluateModel} from '../src/lib/ames-asset-standard.ts';
import {assetBriefSchema} from '../src/lib/ames-asset-standard.ts';
import {z} from 'zod';
import {inspectGlb} from '../src/lib/ames-glb-audit.ts';
const [command,...args]=process.argv.slice(2);
try{
 if(command==='init'){
  const [assetId,output]=args;if(!assetId||!output)throw Error('Usage: init asset-id new-brief.json');
  const brief=newAssetBrief(assetId);assessBrief(brief);await writeFile(output,JSON.stringify(brief,null,2)+'\n',{flag:'wx'});console.log('Created draft brief:',output,'— missing inputs remain explicit.');
 }else if(command==='schema'){
  if(!args[0])throw Error('Usage: schema NEW-schema.json');
  await writeFile(args[0],JSON.stringify(z.toJSONSchema(assetBriefSchema),null,2)+'\n',{flag:'wx'});console.log('Exported brief JSON Schema. Cross-field and evidence checks also require the AMES runtime validator.');
 }else if(command==='check'){
  const [briefFile,modelFile,output]=args;if(!briefFile)throw Error('Usage: check brief.json [model.glb] [new-report.json]');
  const brief=JSON.parse(await readFile(briefFile,'utf8'));let report;
  if(modelFile){const bytes=await readFile(modelFile);report=evaluateModel(brief,inspectGlb(bytes),createHash('sha256').update(bytes).digest('hex'));}
  else{const r=assessBrief(brief);report={assetId:r.brief.assetId,deliverable:r.brief.deliverable,missing:r.missing,pending:r.pending,limitations:r.limitations,status:r.canBeginProduction?'production-input-ready':'production-input-required',publicationApproved:false};}
  if(output)await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));if(('blockers'in report&&report.blockers.length)||('missing'in report&&report.missing.length))process.exitCode=2;
 }else throw Error('Use: node --experimental-strip-types scripts/asset-system.mjs init|schema|check ...');
}catch(e){console.error(e instanceof Error?e.message:e);process.exitCode=1;}
