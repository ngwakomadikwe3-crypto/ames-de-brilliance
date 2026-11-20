// Install the watch strap renderer alongside the pinned engine at build time.
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const file=resolve(dirname(require.resolve('ames-engine')),'../jewelry/PhysicalStudioModel.tsx');
let source=await readFile(file,'utf8');
if(!source.includes('const leatherPalette')){
 const anchor='    return {root,size:bounds.getSize';
 if(!source.includes(anchor))throw Error('Watch renderer changed');
 source="import {CanvasTexture, RepeatWrapping} from 'three'\n"+source.replace(anchor,`    const leatherPalette:Record<string,string>={black:'#292624',cognac:'#a15c35',espresso:'#4e3328',burgundy:'#732d40',navy:'#273b53',forest:'#344c39'};
    const query=new URL(url,window.location.href).searchParams;
    let leather=query.get('leather')??'';
    root.traverse(o=>{if(o.userData.ames_leather)leather=String(o.userData.ames_leather)});
    if(info?.kind==='watch' && Object.hasOwn(leatherPalette,leather)){
      const hide: Object3D[]=[];
      const skin=new MeshPhysicalMaterial({color:leatherPalette[leather],metalness:0,roughness:.67,clearcoat:.12,clearcoatRoughness:.58});
      const grain=document.createElement('canvas');grain.width=grain.height=64;
      const ctx=grain.getContext('2d');
      if(ctx){const pixels=ctx.createImageData(64,64);let seed=713;
        for(let i=0;i<pixels.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const g=seed>>>24;pixels.data.set([g,g,g,255],i)}
        ctx.putImageData(pixels,0,0);const bump=new CanvasTexture(grain);bump.wrapS=bump.wrapT=RepeatWrapping;bump.repeat.set(2,6);
        skin.bumpMap=bump;skin.bumpScale=.025;skin.addEventListener('dispose',()=>bump.dispose())}
      const thread=new MeshPhysicalMaterial({color:leatherPalette[leather],roughness:.91});thread.color.multiplyScalar(1.65);
      materials.push(skin,thread);
      const pitch=info.pitch,width=info.width_mm,verts:number[]=[],uv:number[]=[],idx:number[]=[];
      // A padded oval cross-section with rounded edges, running along each existing strap joint.
      for(let end=0;end<2;end++)for(let j=0;j<=32;j++){const a=j*Math.PI/16,c=Math.cos(a),s=Math.sin(a);
        verts.push((end-.5)*pitch*1.05,Math.sign(s)*Math.pow(Math.abs(s),.55)*1.65,Math.sign(c)*Math.pow(Math.abs(c),.55)*width*.49);
        uv.push(end,j/32);if(end&&j){const i=j-1;idx.push(i,i+33,i+1,i+33,i+34,i+1)}}
      const pad=new BufferGeometry();pad.setAttribute('position',new BufferAttribute(new Float32Array(verts),3));pad.setAttribute('uv',new BufferAttribute(new Float32Array(uv),2));pad.setIndex(idx);pad.computeVertexNormals();skin.side=2;
      const stitch=new BoxGeometry(pitch*.28,.20,.22);geometries.push(pad,stitch);
      for(const {object} of links){
        if(/head/i.test(object.name))continue;
        for(const child of object.children)if(!/clasp|catch|buckle/i.test(child.name))hide.push(child);
        object.add(new Mesh(pad,skin));for(const side of [-1,1])for(const x of [-.25,.25]){
          const seam=new Mesh(stitch,thread);seam.position.set(x*pitch,1.32,side*width*.407);object.add(seam)}
      }
      hide.forEach(o=>{o.visible=false});
    }
`+anchor);
 await writeFile(file,source);
}
