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
export const savedHandKey='ames-saved-hand';
const legacy=['ames-fitting-hand-v2','ames-hand-fit-false','ames-hand-fit-true','ames-hand-tone','ames-hand-colour'];
type SavedHand=Profile & {colour?:string;tone?:number};
function validJoints(j:Joint[]){return Array.isArray(j)&&j.length===21&&j.every(p=>Array.isArray(p)&&p.length===3&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=4))}
function writeProfile(profile:SavedHand){
 localStorage.setItem(savedHandKey,JSON.stringify(profile));
 legacy.forEach(key=>localStorage.removeItem(key));
 window.dispatchEvent(new Event('ames-hand-fit'));
}
export function readSavedHand():SavedHand|null{
 try{
   const saved=JSON.parse(localStorage.getItem(savedHandKey)||'null');
   if(saved&&validJoints(saved.joints))return saved;
   let profile=JSON.parse(localStorage.getItem(legacy[0])||'null') as SavedHand|null;
   if(!profile||!validJoints(profile.joints))profile=null;
   for(const wrist of [false,true]){
     const old=JSON.parse(localStorage.getItem('ames-hand-fit-'+wrist)||'null');
     if(!old||!validJoints(old.joints))continue;
     profile??={joints:old.joints,mirror:old.mirror};
     profile[wrist?'wrist':'finger']??={ratio:old.ratio,mm:old.mm||0};
   }
   if(profile){
     profile.colour=localStorage.getItem('ames-hand-colour')??undefined;
     profile.tone=Number(localStorage.getItem('ames-hand-tone')??50);
     localStorage.setItem(savedHandKey,JSON.stringify(profile));
     legacy.forEach(key=>localStorage.removeItem(key));
   }else legacy.forEach(key=>localStorage.removeItem(key));
   return profile;
 }catch{return null}
}
export function deleteSavedHand(){
 legacy.forEach(key=>localStorage.removeItem(key));
 localStorage.removeItem(savedHandKey);
 window.dispatchEvent(new Event('ames-hand-deleted'));
 window.dispatchEvent(new Event('ames-hand-fit'));
}
export function loadFit(wrist:boolean):HandFit|null{
 const p=readSavedHand();if(!p)return null;
 const width=p[wrist?'wrist':'finger'];
 return {outline:p.outline,joints:p.joints,mirror:p.mirror,wrist,ratio:width?.ratio??0,mm:width?.mm??0,fingerRatio:p.finger?.ratio,wristRatio:p.wrist?.ratio};
}
export function replaceSavedHand(f:HandFit,colour:string){writeProfile({joints:f.joints,outline:f.outline,mirror:f.mirror,colour,tone:50,[f.wrist?'wrist':'finger']:{ratio:f.ratio,mm:f.mm}})}
export function saveHandTone(tone:number){const p=readSavedHand();if(p)writeProfile({...p,tone})}
export function saveFit(f:HandFit){
 const old=readSavedHand(),key=f.wrist?'wrist':'finger';
 const profile:SavedHand={...old,joints:f.joints,outline:f.outline??old?.outline,mirror:f.mirror??old?.mirror};
 if(f.mm>0||!old?.[key]?.mm)profile[key]={ratio:f.ratio,mm:f.mm};
 writeProfile(profile);
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

export function trackedPose(rest:Joint[],live:Joint[]){
 const result=rest.map(p=>new Vector3(...p));
 for(let base=1;base<21;base+=4){
   for(let i=base+1;i<base+4;i++){
     const direction=new Vector3(...live[i]).sub(new Vector3(...live[i-1]));
     const length=new Vector3(...rest[i]).distanceTo(new Vector3(...rest[i-1]));
     if(direction.lengthSq()>1e-8)result[i].copy(result[i-1]).addScaledVector(direction.normalize(),length);
   }
 }
 return result;
}
