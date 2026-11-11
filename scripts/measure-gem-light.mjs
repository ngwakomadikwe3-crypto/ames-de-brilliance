// CPU energy measurement, not a GPU screenshot or phone performance test.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
import {Vector3,Ray,DoubleSide} from 'three';
import {MeshBVH} from 'three-mesh-bvh';
const require=createRequire(import.meta.url),ts=require('typescript');
function loadTS(file){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>name.startsWith('.')?loadTS(path.resolve(path.dirname(file),name+'.ts')):require(name)});return exports;}
const {createStudioBrilliantGeometry}=loadTS('node_modules/ames-engine/src/engine/jewelry/createStudioBrilliantGeometry.ts');
function refract(i,n,eta){const d=i.dot(n),k=1-eta*eta*(1-d*d);return k<0?null:i.clone().multiplyScalar(eta).addScaledVector(n,-eta*d-Math.sqrt(k)).normalize();}
function energy(bvh,entry,direction,budget,ior){
  const n=entry.face.normal.clone();if(n.dot(direction)>0)n.negate();
  let ray=refract(direction,n,1/ior),origin=entry.point.clone().addScaledVector(n,-.00045).addScaledVector(ray,.00015),throughput=1,light=0;
  for(let b=0;b<budget;b++){
    const hit=bvh.raycastFirst(new Ray(origin,ray),DoubleSide);if(!hit){light+=throughput;break;}
    const normal=hit.face.normal.clone();if(normal.dot(ray)>0)normal.negate();
    const exit=refract(ray,normal,ior);
    if(exit){const f0=((ior-1)/(ior+1))**2,f=f0+(1-f0)*(1-Math.max(0,-ray.dot(normal)))**5;light+=throughput*(1-f);throughput*=f;}
    if(throughput<.003)break;
    ray.reflect(normal);origin.copy(hit.point).addScaledVector(ray,.0003);
  }
  return light;
}
const geometry=createStudioBrilliantGeometry(),bvh=new MeshBVH(geometry),result=[];
for(const angle of [0,35,65]){
  const a=angle*Math.PI/180,eye=new Vector3(0,5*Math.cos(a),5*Math.sin(a)),forward=eye.clone().negate().normalize(),right=new Vector3(1,0,0),up=new Vector3().crossVectors(right,forward);
  const totals=Object.fromEntries([3,5,6,8,10,12,16,24].map(b=>[b,0]));let samples=0;
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){
    const target=right.clone().multiplyScalar((x/31-.5)*2.1).addScaledVector(up,(y/31-.5)*2.1),direction=target.sub(eye).normalize(),entry=bvh.raycastFirst(new Ray(eye,direction),DoubleSide);if(!entry)continue;samples++;
    for(const budget of Object.keys(totals))totals[budget]+=energy(bvh,entry,direction,Number(budget),2.417);
  }
  result.push({angle,samples,relativeTo24:Object.fromEntries(Object.entries(totals).map(([b,total])=>[b,+(total/totals[24]).toFixed(5)]))});
}
export const measurements=result;
if(process.argv[1]?.endsWith('measure-gem-light.mjs')) console.log(JSON.stringify(result,null,2));
