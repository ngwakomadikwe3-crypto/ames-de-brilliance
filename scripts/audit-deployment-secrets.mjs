// Reports identifiers/counts only. Never log matched values, blob contents or SDK credentials.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
const git=args=>execFileSync('git',args,{encoding:'utf8',maxBuffer:128*1024*1024,stdio:['pipe','pipe','ignore']});
const names=['AMES_APP_ORIGIN','ASSET_DELIVERY_SECRET','SESSION_SECRET'],secretNames=['ASSET_DELIVERY_SECRET','SESSION_SECRET','APPWRITE_API_KEY','APPWRITE_PROVISION_KEY','APPWRITE_ASSET_IMPORT_KEY'],values=secretNames.map(k=>process.env[k]).filter(v=>v&&v.length>=16);
const report={scope:'current tracked files, index, all locally reachable Git history, public build artifacts; remote-only/deleted unreachable objects not certified',provided:Object.fromEntries(names.map(k=>[k,!!process.env[k]])),trackedFiles:0,historyBlobs:0,indexBlobs:0,configuredValueMatches:[],literalFallbacks:[],envAssignments:[],clientIdentifierMatches:[],environmentFiles:[]};
function inspect(text,location){for(let i=0;i<values.length;i++)if(text.includes(values[i]))report.configuredValueMatches.push({location,configuredSecretIndex:i});
 for(const key of ['ASSET_DELIVERY_SECRET','SESSION_SECRET'])if(new RegExp(`process\\.env\\.${key}\\s*\\|\\|\\s*['\"][^'\"]+['\"]`).test(text))report.literalFallbacks.push({location,key});
 if(/(^|[:/])\.env(\.|$)/.test(location))for(const line of text.split('\n')){const match=/^\s*(AMES_APP_ORIGIN|ASSET_DELIVERY_SECRET|SESSION_SECRET)\s*=\s*(.+?)\s*$/.exec(line);if(match&&!match[2].startsWith('#'))report.envAssignments.push({location,key:match[1]});}
}
const tracked=git(['ls-files','-z']).split('\0').filter(Boolean);for(const path of tracked){report.trackedFiles++;if(path.startsWith('.env'))report.environmentFiles.push(path);try{inspect(await readFile(path,'utf8'),'tracked:'+path);}catch{}}
const staged=git(['ls-files','--stage']).split('\n').map(line=>/^\d+ ([a-f0-9]+) \d\t(.+)$/.exec(line)).filter(Boolean);
const objects=git(['rev-list','--objects','--all']).split('\n').filter(Boolean);const batch=execFileSync('git',['cat-file','--batch-check=%(objectname) %(objecttype)'],{input:objects.map(v=>v.split(' ')[0]).join('\n')+'\n',encoding:'utf8',maxBuffer:128*1024*1024,stdio:['pipe','pipe','ignore']});const paths=new Map(objects.map(v=>{const i=v.indexOf(' ');return [i<0?v:v.slice(0,i),i<0?'':v.slice(i+1)];}));
const historyIds=batch.trim().split('\n').filter(v=>v.endsWith(' blob')).map(v=>v.split(' ')[0]),ids=[...new Set([...historyIds,...staged.map(m=>m[1])])];
const contents=execFileSync('git',['cat-file','--batch'],{input:ids.join('\n')+'\n',maxBuffer:128*1024*1024,stdio:['pipe','pipe','ignore']}),blobs=new Map();let offset=0;
while(offset<contents.length){const end=contents.indexOf(10,offset),[sha,type,size]=contents.subarray(offset,end).toString().split(' ');if(type!=='blob'||!Number.isFinite(Number(size)))throw new Error('Unexpected Git object');offset=end+1;blobs.set(sha,contents.subarray(offset,offset+Number(size)).toString('utf8'));offset+=Number(size)+1;}
for(const m of staged){report.indexBlobs++;inspect(blobs.get(m[1]),'index:'+m[2]);}for(const sha of historyIds){report.historyBlobs++;inspect(blobs.get(sha),'history:'+sha+':'+paths.get(sha));}
async function files(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const path=join(dir,e.name);out.push(...e.isDirectory()?await files(path):[path]);}return out;}
const browser=[...await files('.next/static'),...await files('public')];for(const path of browser){const content=await readFile(path,'utf8');inspect(content,'browser:'+path);if(names.some(k=>content.includes(k)))report.clientIdentifierMatches.push(path);}
report.browserArtifacts=browser.length;report.noConfiguredSecretValuesFound=!report.configuredValueMatches.length;report.clientBoundaryPass=!report.clientIdentifierMatches.length&&!report.configuredValueMatches.some(v=>v.location.startsWith('browser:'));await writeFile('outputs/deployment-secret-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.noConfiguredSecretValuesFound||!report.clientBoundaryPass)process.exitCode=1;
