'use client';
import {Canvas} from '@react-three/fiber';
import {Environment,OrbitControls,useGLTF} from '@react-three/drei';
import {useEffect,useMemo} from 'react';
import {Box3,CatmullRomCurve3,Color,Group,Mesh,MeshStandardMaterial,Quaternion,Vector3} from 'three';
import {MarchingCubes} from 'three/examples/jsm/objects/MarchingCubes.js';
import {defaultJoints,poseJoints,type HandFit} from '../lib/fitting-hand';

function Model({model,fit,wrist,watch,tone,colour,curls}:{model:string;fit:HandFit|null;wrist:boolean;watch:boolean;tone:number;colour?:string;curls:number[]}){
 const {scene}=useGLTF(model),skin=useMemo(()=>new MeshStandardMaterial({roughness:.62}),[]);
 const points=useMemo(()=>poseJoints(fit?.joints||defaultJoints,curls),[fit,curls]);
 const finger=Math.max(.072,Math.min(.15,fit?.fingerRatio?fit.fingerRatio*.44:.098));
 const wristRadius=Math.max(.29,Math.min(.59,fit?.wristRatio?fit.wristRatio*.44:.39));
 if(colour)skin.color.set(colour).multiplyScalar(Math.pow(2,(50-tone)/50));
 else skin.color.copy(new Color('#f4d3b7').lerp(new Color('#42271f'),tone/100));
 const hand=useMemo(()=>{
   const res=92,extent=2.45, surface=new MarchingCubes(res,skin,false,false,50000);
   surface.isolation=0;surface.field.fill(-1);
   function blob(c:Vector3,rx:number,ry:number,rz:number){
     const radii=[rx,ry,rz],pos=c.toArray(),lo=pos.map((v,i)=>Math.max(1,Math.floor((1+(v-radii[i]*1.5)/extent)*res/2))),hi=pos.map((v,i)=>Math.min(res-2,Math.ceil((1+(v+radii[i]*1.5)/extent)*res/2)));
     for(let z=lo[2];z<=hi[2];z++)for(let y=lo[1];y<=hi[1];y++)for(let x=lo[0];x<=hi[0];x++){
       const d=1-Math.hypot(((2*x/res-1)*extent-c.x)/rx,((2*y/res-1)*extent-c.y)/ry,((2*z/res-1)*extent-c.z)/rz);
       const k=x+res*(y+res*z);surface.field[k]=Math.max(surface.field[k],d);
     }
   }
   for(let j=0;j<30;j++){const u=j/29;blob(points[0].clone().add(new Vector3(0,-u*1.05,0)),wristRadius*(1+.22*u),.30,.19+.045*u)}
   for(let j=0;j<=12;j++){const t=j/12,c=points[0].clone().lerp(points[9],t*.89);blob(c,.34+.19*Math.sin(t*2.3),.30,.17+.042*Math.sin(t*Math.PI))}
   for(let digit=0;digit<5;digit++){
     const base=digit*4+1,knuckles=points.slice(base,base+4);
     const curve=new CatmullRomCurve3([points[0].clone().lerp(knuckles[0],.65),...knuckles]);
     const r=[.126,.107,.112,finger,.088][digit];
     for(let i=0;i<=42;i++){const t=i/42,rad=r*(1.12-.48*t+.055*Math.cos(6*Math.PI*t));blob(curve.getPointAt(t),rad,rad*1.05,rad*.87)}
   }
   surface.update();surface.geometry.computeBoundingSphere();surface.scale.setScalar(extent);return surface;
 },[points,skin,finger,wristRadius]);
 useEffect(()=>()=>hand.geometry.dispose(),[hand]);useEffect(()=>()=>skin.dispose(),[skin]);
 const piece=useMemo(()=>{
   const group=new Group(),copy=scene.clone(true);
   const metal=new URL(model,window.location.href).searchParams.get('metal');
   copy.traverse(o=>{if(o instanceof Mesh && metal && ['gold','rose-gold'].includes(metal)){
     const repaint=(m:MeshStandardMaterial)=>{if(!m.isMeshStandardMaterial||m.metalness<.65)return m;const v=m.clone();v.color.set(metal==='gold'?'#edbe75':'#e6a994');return v};
     o.material=Array.isArray(o.material)?o.material.map(repaint):repaint(o.material);
   }});
   const bounds=new Box3().setFromObject(copy),size=bounds.getSize(new Vector3());
   copy.position.sub(bounds.getCenter(new Vector3()));group.add(copy);
   const axis=size.z<=size.x&&size.z<=size.y?new Vector3(0,0,1):size.y<=size.x?new Vector3(0,1,0):new Vector3(1,0,0);
   if(watch)group.rotation.z=-Math.PI/2;else if(axis.z)group.rotation.x=Math.PI/2;else if(axis.x)group.rotation.z=-Math.PI/2;
   const diameter=wrist?wristRadius*2.24:finger*2.45;
   group.scale.setScalar(diameter/(watch?Math.max(size.y,.00001):Math.max(size.x,size.y,size.z,.00001)));
   const mount=new Group();mount.add(group);
   mount.position.copy(wrist?points[0].clone().add(new Vector3(0,-.22,0)):points[13].clone().lerp(points[14],.35));
   if(!wrist)mount.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),points[14].clone().sub(points[13]).normalize()));
   return mount;
 },[model,scene,points,wrist,watch,wristRadius,finger]);
 return <group scale={[fit?.mirror?-1:1,1,1]}><primitive object={hand}/><primitive object={piece}/></group>;
}
export default function FittingHandScene(props:{model:string;fit:HandFit|null;wrist:boolean;watch:boolean;tone:number;colour?:string;curls:number[]}){
 return <Canvas frameloop="demand" dpr={[1,1.6]} camera={{position:[0,0,4.8],fov:40}}><ambientLight intensity={.65}/><directionalLight position={[-3,4,5]} intensity={2.3}/><Environment files="/ames-engine/environments/jewellery-tent-v3.hdr"/><Model {...props}/><OrbitControls enablePan={false} minDistance={1.3} maxDistance={6} target={[0,props.wrist?-.37:.35,0]}/></Canvas>;
}
