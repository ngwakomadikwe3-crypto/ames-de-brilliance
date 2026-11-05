import {readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

const traces=[];
async function walk(directory){
  for(const item of await readdir(directory,{withFileTypes:true})){
    const file=path.join(directory,item.name);
    if(item.isDirectory())await walk(file);
    else if(item.name.endsWith('.nft.json'))traces.push(file);
  }
}
await walk('.next/server');
const forbidden=['/.ames-cad/','/docs/qa/','/source-assets/','/share/'];
const privateOrReviewEntries=[];
for(const trace of traces){
  for(const file of JSON.parse(await readFile(trace,'utf8')).files??[]){
    if(forbidden.some(value=>file.replaceAll('\\','/').includes(value)))privateOrReviewEntries.push({trace,file});
  }
}
const report={serverManifests:traces.length,privateOrReviewEntries};
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({serverManifests:traces.length,privateOrReviewEntries:privateOrReviewEntries.length}));
if(!traces.length||privateOrReviewEntries.length)process.exitCode=1;
