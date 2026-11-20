// Install the watch strap renderer alongside the pinned engine at build time.
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const file=resolve(dirname(require.resolve('ames-engine')),'../jewelry/PhysicalStudioModel.tsx');
let source=await readFile(file,'utf8');
if(source.includes('const leatherPalette')&&!source.includes('const embossedStrap')){
 const start=source.indexOf('    const leatherPalette'),end=source.indexOf('    return {root,size:bounds.getSize',start);
 if(start<0||end<0)throw Error('Leather renderer changed');
 source=source.slice(0,start)+source.slice(end);
}
if(!source.includes('const embossedStrap')){
 const anchor='    return {root,size:bounds.getSize';
 if(!source.includes(anchor))throw Error('Watch renderer changed');
 source=(source.includes('import {CanvasTexture, RepeatWrapping}')?'':"import {CanvasTexture, RepeatWrapping} from 'three'\n")+"import {CapsuleGeometry} from 'three'\n"+source.replace(anchor,`    const embossedStrap=true;\n    const leatherPalette:Record<string,string>={black:'#292624',cognac:'#a15c35',espresso:'#4e3328',burgundy:'#732d40',navy:'#273b53',forest:'#344c39'};
    const query=new URL(url,window.location.href).searchParams;
    let leather=query.get('leather')??'';
    root.traverse(o=>{if(o.userData.ames_leather)leather=String(o.userData.ames_leather)});
    if(embossedStrap && info?.kind==='watch' && Object.hasOwn(leatherPalette,leather)){
      const hide: Object3D[]=[];
      const skin=new MeshPhysicalMaterial({color:leatherPalette[leather],metalness:0,roughness:.39,clearcoat:.34,clearcoatRoughness:.30});
      const grain=document.createElement('canvas');grain.width=256;grain.height=512;
      const ctx=grain.getContext('2d');
      if(ctx){const pixels=ctx.createImageData(256,512);let seed=713;
        for(let y=0;y<512;y++)for(let x=0;x<256;x++){
          seed=(Math.imul(seed,1664525)+1013904223)>>>0;
          const u=x/256,v=y/512,ph=2*Math.PI;
          const cross=u+.06*Math.sin(ph*v*4)+.026*Math.sin(ph*v*9);
          const crown=3*v+.13*Math.sin(ph*u)+.085*Math.sin(ph*(u*2+v));
          const groove=Math.min(Math.abs(Math.sin(Math.PI*cross))*1.25,Math.abs(Math.sin(Math.PI*crown)));
          const height=Math.min(1,groove*9),g=Math.round(80+133*height+18*groove+(seed>>>27)*.7);
          pixels.data.set([g,g,g,255],4*(y*256+x))}
        ctx.putImageData(pixels,0,0);const bump=new CanvasTexture(grain);bump.wrapS=bump.wrapT=RepeatWrapping;
        skin.map=bump;skin.bumpMap=bump;skin.bumpScale=.14;skin.addEventListener('dispose',()=>bump.dispose())}
      const thread=new MeshPhysicalMaterial({color:leatherPalette[leather],roughness:.78});thread.color.lerp(thread.color.clone().set('#c69667'),.52);
      const hardware=new MeshPhysicalMaterial({color:'#e0ddd5',metalness:1,roughness:.19,envMap:studio.metal});
      materials.push(skin,thread,hardware);
      const pitch=info.pitch,width=info.width_mm,verts:number[]=[],uv:number[]=[],idx:number[]=[];
      // A padded oval cross-section with rounded edges, running along each existing strap joint.
      for(let end=0;end<2;end++)for(let j=0;j<=32;j++){const a=j*Math.PI/16,c=Math.cos(a),s=Math.sin(a);
        verts.push((end-.5)*pitch*1.05,Math.sign(s)*Math.pow(Math.abs(s),.55)*1.65,Math.sign(c)*Math.pow(Math.abs(c),.55)*width*.49);
        uv.push(end,j/32);if(end&&j){const i=j-1;idx.push(i,i+33,i+1,i+33,i+34,i+1)}}
      const pad=new BufferGeometry();pad.setAttribute('position',new BufferAttribute(new Float32Array(verts),3));pad.setAttribute('uv',new BufferAttribute(new Float32Array(uv),2));pad.setIndex(idx);pad.computeVertexNormals();skin.side=2;
      const stitch=new BoxGeometry(pitch*.28,.20,.22);geometries.push(pad,stitch);
      for(const {object,order} of links){
        if(/head/i.test(object.name))continue;
        for(const child of object.children)hide.push(child);
        let face=skin;
        if(order>=links.length-5){
          face=skin.clone();const mask=document.createElement('canvas');mask.width=128;mask.height=256;
          const c=mask.getContext('2d');if(c){c.fillStyle='white';c.fillRect(0,0,128,256);c.fillStyle='black';
            for(const y of [64,192]){c.beginPath();c.ellipse(64,y,12,4,0,0,Math.PI*2);c.fill()}
            const a=new CanvasTexture(mask);face.alphaMap=a;face.alphaTest=.5;face.addEventListener('dispose',()=>a.dispose())}
          materials.push(face);
        }
        object.add(new Mesh(pad,face));
        const bar=(a:Vector3,b:Vector3,r:number,m:MeshPhysicalMaterial)=>{
          const dir=b.clone().sub(a),geo=new CapsuleGeometry(r,Math.max(.01,dir.length()-2*r),4,12);
          geometries.push(geo);const part=new Mesh(geo,m);part.position.copy(a).lerp(b,.5);
          part.quaternion.setFromUnitVectors(new Vector3(0,1,0),dir.normalize());object.add(part)};
        if(order===0){
          const a=pitch*.55,b=width*.53,y=2.35;
          for(const sign of [-1,1]){
            bar(new Vector3(-a,y,sign*b),new Vector3(a,y,sign*b),.8,hardware);
            bar(new Vector3(sign*a,y,-b),new Vector3(sign*a,y,b),.8,hardware)}
          bar(new Vector3(-a,y,0),new Vector3(a+.2,y+.5,0),.55,hardware);
        }else if(order===1||order===2){
          const geo=new BoxGeometry(2.9,1.25,width*1.02);geometries.push(geo);
          const loop=new Mesh(geo,skin);loop.position.y=1.85;object.add(loop);
        }
        for(const side of [-1,1])for(const x of [-.25,.25]){
          const seam=new Mesh(stitch,thread);seam.position.set(x*pitch,1.32,side*width*.407);object.add(seam)}
      }
      hide.forEach(o=>{o.visible=false});
    }
`+anchor);
 await writeFile(file,source);
}
