import {Vector3} from 'three';
export type Joint=[number,number,number];
type Outline={digits:number[];palm:number;wrist:number;surface?:{image:string;uv:[number,number][];aspect:number}};
export type HandFit={outline?:Outline;joints:Joint[];ratio:number;mm:number;wrist:boolean;mirror?:boolean;fingerRatio?:number;wristRatio?:number};
export const defaultJoints:Joint[]=[
 [0,-.66,0],[.38,-.47,0],[.66,-.28,.09],[.85,-.03,.12],[.99,.14,.11],
 [.43,.50,0],[.50,.93,.02],[.52,1.22,0],[.54,1.43,-.04],
 [.13,.61,.02],[.14,1.10,.04],[.13,1.42,.02],[.12,1.64,-.02],
 [-.16,.56,.01],[-.20,1.01,.04],[-.23,1.31,.01],[-.25,1.52,-.03],
 [-.44,.40,0],[-.55,.72,.03],[-.60,.94,.01],[-.65,1.12,-.02]];
export function fitFromCamera(points:{x:number;y:number;z:number}[],ratio:number,mm:number,wrist:boolean):HandFit|null{
 if(points.length!==21||!Number.isFinite(ratio)||ratio<=0)return null;
 const v=points.map(p=>new Vector3(p.x,-p.y,-p.z));
 const across=v[5].clone().sub(v[17]),width=across.length();if(width<.001)return null;
 across.normalize();const up=v[9].clone().sub(v[0]);up.addScaledVector(across,-across.dot(up)).normalize();
 const normal=across.clone().cross(up).normalize();if(normal.z<0)normal.negate();
 const joints=v.map(p=>{const d=p.clone().sub(v[0]).multiplyScalar(.88/width);return [d.dot(across),d.dot(up)-.66,d.dot(normal)] as Joint});
 if(joints.flat().some(n=>!Number.isFinite(n)||Math.abs(n)>4))return null;
 return {joints,ratio,mm,wrist,mirror:across.x<0};
}
type Width={ratio:number;mm:number};
type Profile={outline?:Outline;joints:Joint[];mirror?:boolean;finger?:Width;wrist?:Width};
const profileKey='ames-fitting-hand-v2';
let current:Profile|null=null;
function validJoints(j:Joint[]){return Array.isArray(j)&&j.length===21&&j.every(p=>Array.isArray(p)&&p.length===3&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=4))}
function readProfile():Profile|null{
 try{
   const saved=JSON.parse(localStorage.getItem(profileKey)||'null');
   if(current)return current;
   if(saved && validJoints(saved.joints))return saved;
   let migrated:Profile|null=null;
   for(const wrist of [false,true]){
     const old=JSON.parse(localStorage.getItem('ames-hand-fit-'+wrist)||'null');
     if(old&&validJoints(old.joints)&&Number.isFinite(old.ratio)&&old.ratio>0){
       migrated??={joints:old.joints};migrated[wrist?'wrist':'finger']={ratio:old.ratio,mm:old.mm||0};
     }
   }
   return current||migrated;
 }catch{return current}
}
export function loadFit(wrist:boolean):HandFit|null{
 const p=readProfile();if(!p)return null;
 const width=p[wrist?'wrist':'finger'];
 return {outline:p.outline,joints:p.joints,mirror:p.mirror,wrist,ratio:width?.ratio??0,mm:width?.mm??0,fingerRatio:p.finger?.ratio,wristRatio:p.wrist?.ratio};
}
export function saveFit(f:HandFit){
 const old=readProfile(), key=f.wrist?'wrist':'finger';
 const profile:Profile={...old,outline:f.outline??old?.outline,joints:f.joints,mirror:f.mirror??old?.mirror};
 if(f.mm>0 || !old?.[key]?.mm)profile[key]={ratio:f.ratio,mm:f.mm};
 current=profile;try{localStorage.setItem(profileKey,JSON.stringify(profile))}catch{}
 window.dispatchEvent(new Event('ames-hand-fit'));
}
export function poseJoints(joints:Joint[],curls:number[]){
 const points=joints.map(p=>new Vector3(...p));
 for(let digit=0;digit<5;digit++){
   const start=1+digit*4,base=points[start],tip=points[start+3];
   const forward=tip.clone().sub(base);forward.z=0;
   if(forward.lengthSq()<.0001)forward.set(0,1,0);forward.normalize();
   const axis=new Vector3(-forward.y,forward.x,0);
   let angle=0;
   for(let k=1;k<=3;k++){
     const segment=new Vector3(...joints[start+k]).sub(new Vector3(...joints[start+k-1]));
     angle+=(digit===0?[.42,.6,.65]:[1.05,1.32,.87])[k-1]*(curls[digit]||0);
     points[start+k]=points[start+k-1].clone().add(segment.applyAxisAngle(axis,angle));
   }
 }
 return points;
}
