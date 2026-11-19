import {Vector3, Matrix4, CatmullRomCurve3, LineCurve3, TubeGeometry} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {NodeIO, Accessor} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder, MeshoptEncoder} from 'meshoptimizer';
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const base='public/ames-engine', folder=base+'/ames-pear-fringe-necklace/web';
for(const cut of ['Round','Oval','Cushion']){
  const necklace=await io.read(folder+'/pear-fringe-necklace-v2.glb');
  const template=await io.read(base+'/gallery-cuts/'+cut+'/stone-amethyst.glb');
  const source=template.getRoot().listMeshes()[0].listPrimitives()[0];
  const pos=source.getAttribute('POSITION'), normal=source.getAttribute('NORMAL');
  const lo=pos.getMin([]),hi=pos.getMax([]);
  const drops=necklace.getRoot().listNodes().filter(n=>n.getName().startsWith('Pear drop diamond'));
  for(const node of drops){
    const prim=node.getMesh().listPrimitives()[0], original=prim.getAttribute('POSITION');
    const min=[Infinity,Infinity,Infinity],max=min.map(()=>-Infinity);
    for(let i=0;i<original.getCount();i++){const p=original.getElement(i,[]);p.forEach((v,k)=>{min[k]=Math.min(min[k],v);max[k]=Math.max(max[k],v);});}
    const scale=1.08*Math.min(...[0,2].map(k=>(max[k]-min[k])/(hi[k]-lo[k])));
    const positions=new Float32Array(pos.getCount()*3);
    for(let i=0;i<pos.getCount();i++) positions.set(pos.getElement(i,[]).map((v,k)=>(v-(hi[k]+lo[k])/2)*scale+(max[k]+min[k])/2),i*3);
    const attr=(arr)=>necklace.createAccessor().setType(Accessor.Type.VEC3).setArray(arr).setBuffer(original.getBuffer());
    prim.setIndices(null).setAttribute('POSITION',attr(positions)).setAttribute('NORMAL',attr(new Float32Array(normal.getArray())));
    // Follow the actual girdle around the new drop and hang it from the same link.
    const contour=new Map();
    for(let i=0;i<pos.getCount();i++){
      const [x,y,z]=pos.getElement(i,[]);
      const angle=Math.atan2(z-(hi[2]+lo[2])/2,x-(hi[0]+lo[0])/2);
      const key=Math.round(angle*1000), distance=Math.hypot(x-(hi[0]+lo[0])/2,z-(hi[2]+lo[2])/2);
      if(!contour.has(key)||distance>contour.get(key).distance)contour.set(key,{angle,distance,i});
    }
    const outline=[...contour.values()].filter(p=>p.distance>.01).sort((a,b)=>a.angle-b.angle);
    // Convex hull removes inner facet vertices from the setting outline.
    const points=outline.map(p=>new Vector3().fromArray(positions,p.i*3)).sort((a,b)=>a.x-b.x||a.z-b.z);
    function half(rows){const h=[];for(const p of rows){while(h.length>=2){const a=h.at(-2),b=h.at(-1);if((b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x)>1e-8)break;h.pop();}h.push(p);}return h.slice(0,-1);}
    const hull=half(points).concat(half([...points].reverse()));
    const seatY=(max[1]+min[1])/2-(max[1]-min[1])*.08;
    hull.forEach(p=>p.y=seatY);
    const radius=scale*.035;
    const top=hull.reduce((a,b)=>a.z>b.z?a:b);
    const hanger=new Vector3().applyMatrix4(new Matrix4().fromArray(node.getMatrix()).invert());
    const rail=mergeGeometries([new TubeGeometry(new CatmullRomCurve3(hull,true),64,radius,8,true),new TubeGeometry(new LineCurve3(top,hanger),1,radius,8,false)]).toNonIndexed();
    const mount=necklace.getRoot().listNodes().find(n=>n.getName()===node.getName().replace('diamond','setting'));
    const old=mount.getMesh().listPrimitives()[0];
    const fitted=necklace.createPrimitive().setMaterial(old.getMaterial()).setAttribute('POSITION',attr(rail.attributes.position.array)).setAttribute('NORMAL',attr(rail.attributes.normal.array));
    mount.setMesh(necklace.createMesh().addPrimitive(fitted)).setMatrix(node.getMatrix());
    node.setExtras({...node.getExtras(),ames_cut:cut.toLowerCase(),ames_gemstone_id:'house-cut-diamond'});
  }
  await io.write(folder+'/fringe-'+cut.toLowerCase()+'.glb',necklace);
}
