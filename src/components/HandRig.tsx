'use client';
import {useMemo,useEffect,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {useGLTF} from '@react-three/drei';
import {Bone,Box3,Group,Matrix4,Mesh,MeshPhysicalMaterial,MeshStandardMaterial,Quaternion,ShadowMaterial,SphereGeometry,Vector3} from 'three';
import type {RefObject} from 'react';
import {defaultJoints,type HandFit} from '../lib/fitting-hand';
import type {CameraPoint} from '../lib/one-euro-hand';

export type TryFit={finger:number;diameter:number;reference:number;wrist:number;clasp:number;size:number;length:number;tone:string};
export type RigFrame={points:CameraPoint[];aspect:number};
export function HandRig({frame,clone,model,wrist,watch,fit,settings}:{frame:RefObject<RigFrame|null>;clone:boolean;model:string;wrist:boolean;watch:boolean;fit:HandFit|null;settings:TryFit}){
 const {scene}=useGLTF(model);
 const {size:display}=useThree();
 const root=useRef<Group>(null);
 const rig=useMemo(()=>{
   const group=new Group(),sphere=new SphereGeometry(1,20,14);
   const skin=new MeshPhysicalMaterial({roughness:.59,clearcoat:.05});
   // Diffuse wrap approximates scattering in the thin edges of fingers.
   skin.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
     float rim=pow(1.0-abs(dot(normal,normalize(vViewPosition))),3.0);
     reflectedLight.indirectDiffuse+=diffuseColor.rgb*vec3(.19,.066,.045)*rim;`);};
   const nail=new MeshPhysicalMaterial({color:'#dfb3a8',roughness:.37,clearcoat:.45});
   const crease=new MeshStandardMaterial({roughness:.82});
   const shadow=new ShadowMaterial({opacity:.24});
   shadow.depthWrite=false;
   const materials=[skin,nail,crease];
   for(const m of materials){m.colorWrite=clone;m.depthWrite=true}
   function mesh(parent:Group|Bone,material=skin){
     const part=new Mesh(sphere,material);part.castShadow=clone;part.receiveShadow=clone;part.renderOrder=-1;parent.add(part);return part;
   }
   const palm=mesh(group),forearm=mesh(group);
   function receiveContact(part:Mesh){
     if(clone)return;
     const receiver=new Mesh(sphere,shadow);
     receiver.scale.setScalar(1.003);receiver.receiveShadow=true;receiver.renderOrder=1;
     part.add(receiver);
   }
   receiveContact(palm);receiveContact(forearm);
   const bones=Array.from({length:21},()=>new Bone());
   const segments:Mesh[]=[];
   for(let i=0;i<21;i++){
     if(i%4===1||i===0)group.add(bones[i]);else bones[i-1].add(bones[i]);
     if(i%4===0)continue;
     segments[i]=mesh(bones[i]);receiveContact(segments[i]);
     if(i%4===3){
       const tip=mesh(bones[i],nail);tip.name='nail';tip.position.set(0,.70,.72);tip.scale.set(.72,.27,.21);
       segments[i].add(tip);
     }else if(clone){
       const line=new Mesh(sphere,crease);line.position.set(0,.76,.62);line.scale.set(.53,.027,.075);segments[i].add(line);
     }
   }
   const mount=new Group(),piece=scene.clone(true),box=new Box3().setFromObject(piece),size=box.getSize(new Vector3());
   piece.position.sub(box.getCenter(new Vector3()));
   piece.traverse(o=>{if(o instanceof Mesh){o.castShadow=true;o.receiveShadow=true}});
   const oriented=new Group();oriented.add(piece);
   if(watch)oriented.rotation.z=-Math.PI/2;
   else if(size.z<=size.x&&size.z<=size.y)oriented.rotation.x=Math.PI/2;
   else if(size.x<=size.y)oriented.rotation.z=-Math.PI/2;
   oriented.scale.setScalar(1/Math.max(size.x,size.y,size.z,.00001));mount.add(oriented);group.add(mount);
   // Estimate the band bore from its vertices in the plane perpendicular to its axis.
   // A low percentile rejects isolated engraving and inner prong vertices.
   const radial:number[]=[],vertex=new Vector3();
   oriented.updateMatrixWorld(true);
   if(!wrist)piece.traverse(o=>{
     if(!(o instanceof Mesh))return;
     const pos=o.geometry.getAttribute('position');if(!pos)return;
     for(let i=0;i<pos.count;i+=Math.max(1,Math.ceil(pos.count/6000))){
       vertex.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld);
       if(Math.abs(vertex.y)<.12)radial.push(Math.hypot(vertex.x,vertex.z));
     }
   });
   radial.sort((a,b)=>a-b);
   const bore=2*(radial[Math.floor(radial.length*.06)]??0);
   return {group,palm,forearm,bones,segments,skin,crease,mount,sphere,materials,shadow,bore:bore>.25&&bore<1?bore:1/1.17};
 },[scene,clone,watch,wrist]);
 useEffect(()=>()=>{rig.sphere.dispose();rig.shadow.dispose();rig.materials.forEach(m=>m.dispose())},[rig]);
 const lastPose=useRef<RigFrame|null>(null);
 const scratch=useMemo(()=>({p:defaultJoints.map(()=>new Vector3()),x:new Vector3(),y:new Vector3(),z:new Vector3(),v:new Vector3(),side:new Vector3(),normal:new Vector3(),orientation:new Quaternion(),mountRotation:new Quaternion(),mountPosition:new Vector3(),matrix:new Matrix4()}),[]);
 useFrame(()=>{
   const data=frame.current;
   if(!root.current)return;
   root.current.visible=!!data;
   if(!data){lastPose.current=null;return}
   const {p,x,y,z,v,matrix}=scratch;
   for(let i=0;i<21;i++){
     const q=data.points[i];p[i].set((q.x-.5)*(display.width/100),(.5-q.y)*(display.height/100),-(q.z-data.points[0].z)*(display.width/100));
   }
   const span=p[5].distanceTo(p[17]);
   if(span<.001)return;
   y.subVectors(p[9],p[0]).normalize();
   x.subVectors(p[5],p[17]);x.addScaledVector(y,-x.dot(y)).normalize();
   z.crossVectors(x,y).normalize();matrix.makeBasis(x,y,z);
   const base=1+4*settings.finger;
   if(wrist){
     scratch.mountPosition.copy(p[0]).addScaledVector(y,-span*.085);
     scratch.mountRotation.setFromRotationMatrix(matrix);
   }else{
     scratch.mountPosition.copy(p[base]).lerp(p[base+1],.35);
     const axis=scratch.v.subVectors(p[base+1],p[base]).normalize();
     const side=scratch.side.crossVectors(axis,z).normalize();
     scratch.mountRotation.setFromRotationMatrix(new Matrix4().makeBasis(side,axis,scratch.normal.crossVectors(side,axis).normalize()));
   }
   for(let i=1;i<21;i++){
     const base=1+4*Math.floor((i-1)/4);
     if(i===base)continue;
     p[i].sub(p[base]).multiplyScalar(settings.length).add(p[base]);
   }
   for(let i=1;i<21;i++)p[i].sub(p[0]).multiplyScalar(settings.size).add(p[0]);
   const width=span*settings.size;
   rig.skin.color.set(settings.tone);rig.crease.color.copy(rig.skin.color).multiplyScalar(.72);
   rig.palm.position.copy(p[0]).lerp(p[9],.53);rig.palm.quaternion.setFromRotationMatrix(matrix);
   rig.palm.scale.set(width*(fit?.outline?.palm??1.08)*.50,p[9].distanceTo(p[0])*.63,width*.20);
   const wristWidth=width*(fit?.outline?.wrist??.78)*settings.wrist;
   rig.forearm.position.copy(p[0]).addScaledVector(y,-width*.43);rig.forearm.quaternion.copy(rig.palm.quaternion);rig.forearm.scale.set(wristWidth*.51,width*.78,wristWidth*.29);
   for(let d=0;d<5;d++){
     const base=1+4*d;
     for(let k=0;k<3;k++){
       const i=base+k,bone=rig.bones[i],parent=bone.parent!;
       parent.updateWorldMatrix(true,false);
       bone.position.copy(p[i]);parent.worldToLocal(bone.position);
       const len=v.subVectors(p[i+1],p[i]).length();
       if(len<.0001)continue;
       const dir=v.normalize();
       const side=scratch.side.crossVectors(dir,z).normalize(),normal=scratch.normal.crossVectors(side,dir).normalize();
       matrix.makeBasis(side,dir,normal);bone.quaternion.setFromRotationMatrix(matrix);
       bone.quaternion.premultiply(parent.getWorldQuaternion(scratch.orientation).invert());
       const radius=width*(fit?.outline?.digits[d]??[.25,.21,.22,.20,.17][d])*.5*(1-k*.10);
       const part=rig.segments[i];part.position.set(0,len*.5,0);part.scale.set(radius,len*.59,radius*.89);
     }
   }
   const ratio=fit?.outline?.digits[settings.finger]??[.25,.21,.22,.20,.17][settings.finger];
   const scale=wrist?span*(fit?.outline?.wrist??.78)*settings.wrist*1.18*settings.clasp:span*ratio/rig.bore*settings.diameter/settings.reference;
   if(lastPose.current!==data){
     const alpha=lastPose.current ? .3 : 1;
     rig.mount.position.lerp(scratch.mountPosition,alpha);
     rig.mount.quaternion.slerp(scratch.mountRotation,alpha);
     rig.mount.scale.setScalar(rig.mount.scale.x+(scale-rig.mount.scale.x)*alpha);
     lastPose.current=data;
   }
 });
 return <group ref={root} visible={false}><primitive object={rig.group}/></group>;
}
