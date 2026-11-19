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
    const scale=Math.min(...[0,2].map(k=>(max[k]-min[k])/(hi[k]-lo[k])));
    const positions=new Float32Array(pos.getCount()*3);
    for(let i=0;i<pos.getCount();i++) positions.set(pos.getElement(i,[]).map((v,k)=>(v-(hi[k]+lo[k])/2)*scale+(max[k]+min[k])/2),i*3);
    const attr=(arr)=>necklace.createAccessor().setType(Accessor.Type.VEC3).setArray(arr).setBuffer(original.getBuffer());
    prim.setIndices(null).setAttribute('POSITION',attr(positions)).setAttribute('NORMAL',attr(new Float32Array(normal.getArray())));
    node.setExtras({...node.getExtras(),ames_cut:cut.toLowerCase(),ames_gemstone_id:'house-cut-diamond'});
  }
  await io.write(folder+'/fringe-'+cut.toLowerCase()+'.glb',necklace);
}
