import * as T from 'three';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';

export async function makeStyleModel(kind:string,style:string,metal:string,width:number,stone:string,shape:string){
  const scene=new T.Group();
  const finishes:Record<string,string>={'Platinum':'#e6e6e3','Palladium':'#bbc5c9','White Gold':'#e9e3d9','Yellow Gold':'#edbd59','Rose Gold':'#de9b87','Black Zirconium':'#34363a'};
  const alloy=(color:string)=>new T.MeshStandardMaterial({color,metalness:1,roughness:.17});
  const main=alloy(finishes[style==='Black Zirconium'?style:metal]);
  const accent=alloy(metal==='Yellow Gold'?'#e6e6e3':'#edbd59');
  const coloured=style==='Gemstone'||(kind==='bracelet'&&stone==='Gemstone');
  const gem=new T.MeshPhysicalMaterial({color:coloured?'#29977b':'#f0f8ff',metalness:.05,roughness:.055,transmission:.68,ior:2.42,thickness:.07,flatShading:true});
  gem.name=coloured?'Gemstone':'Diamond';
  function mesh(geometry:T.BufferGeometry,material:T.Material,x=0,y=0,z=0){
    const m=new T.Mesh(geometry,material);m.position.set(x,y,z);scene.add(m);return m;
  }
  function circle(radius:number,tube:number,material=main,x=0,y=0,z=0){
    return mesh(new T.TorusGeometry(radius,tube,10,96),material,x,y,z);
  }
  const ball=new T.SphereGeometry(1,10,8);
  const cut=new T.LatheGeometry([new T.Vector2(0,-.62),new T.Vector2(1,0),new T.Vector2(.98,.06),new T.Vector2(.57,.39),new T.Vector2(0,.39)],shape==='Princess'?4:12).toNonIndexed();
  if(kind!=='bracelet'||shape==='Princess')cut.rotateX(Math.PI/2);cut.computeVertexNormals();
  if(shape==='Pear' && kind!=='bracelet'){
    const p=cut.getAttribute('position');
    for(let i=0;i<p.count;i++){const y=p.getY(i);p.setXYZ(i,p.getX(i)*(1-.48*Math.max(0,y)),y*(y>0?1.5:1),p.getZ(i))}
    cut.computeVertexNormals();
  }
  function jewel(x:number,y:number,z:number,size:number,setting=style){
    const g=mesh(cut,gem,x,y,z);g.scale.setScalar(size);
    if(kind==='bracelet'){
      g.userData.ames_optical_mode='closed-dielectric-visual';
      g.userData.ames_gemstone_id=coloured?'stone-tsavorite-garnet':'stone-diamond';
      if(shape!=='Princess'){
        g.userData.ames_cut=shape==='Pear'?'pear':'round';
        g.rotation.x=Math.PI/2;
        g.rotateOnWorldAxis(new T.Vector3(0,0,1),Math.atan2(y,x));
        if(shape==='Pear')g.scale.z*=1.35;
      }
    }
    if(setting==='Rub Over Tennis'||setting==='Bezel Set'||setting==='Illusion'){
      circle(size*1.01,size*(setting==='Illusion'?.18:.09),main,x,y,z);
    }else{
      const claws=setting==='Prong Set'?6:4;
      for(let k=0;k<claws;k++){const a=(k+.5)*2*Math.PI/claws;mesh(ball,main,x+Math.cos(a)*size*.9,y+Math.sin(a)*size*.9,z).scale.setScalar(size*.115)}
    }
  }
  if(kind==='ring'){
    const halfWidth=width/19;
    const profile=Array.from({length:25},(_,i)=>{const a=i*Math.PI/12;return new T.Vector2(1+.085*Math.cos(a),halfWidth*Math.sin(a))});
    const band=mesh(new T.LatheGeometry(profile,144),main);
    if(style==='Shaped'||style==='Carved'||style==='Designer'){
      const pos=band.geometry.getAttribute('position');
      for(let i=0;i<pos.count;i++){const a=Math.atan2(pos.getZ(i),pos.getX(i));pos.setY(i,pos.getY(i)+halfWidth*.7*Math.cos(a*(style==='Carved'?12:style==='Designer'?5:2)))}
      band.geometry.computeVertexNormals();
    }
    if(style==='Two Tone'||style==='Vintage'){
      for(const side of [-1,1])circle(1.042,.026,style==='Two Tone'?accent:main,0,side*halfWidth*.79).rotation.x=Math.PI/2;
    }
    if(['Diamond Set','Vintage','Gemstone'].includes(style)){
      const count=style==='Gemstone'?5:17;
      for(let i=0;i<count;i++){
        const a=(i/(count-1)-.5)*1.8;
        const start=scene.children.length;jewel(0,0,1.087,Math.min(.13,halfWidth*.83));
        for(const m of scene.children.slice(start)){m.position.applyAxisAngle(new T.Vector3(0,1,0),a);m.rotation.y=a}
      }
    }
    scene.rotation.x=.42;
  }else{
    const necklace=kind==='necklace',rx=necklace?1.45:1.15,ry=necklace?1.65:.84;
    const rail=circle(1,style==='Delicate'?.016:.031);rail.scale.set(rx,ry,1);
    if(['Channel Set','Fancy Bangles','Pavé Set'].includes(style)){
      for(const delta of [-.052,.052])circle(1,.022,style==='Fancy Bangles'?accent:main).scale.set(rx+delta,ry+delta,1);
    }
    const count=style==='Delicate'?12:style==='Cluster'?22:necklace?60:style==='Prong Set'?36:46;
    for(let i=0;i<count;i++){
      const a=i*2*Math.PI/count,x=rx*Math.cos(a),y=ry*Math.sin(a);
      if(style==='Cluster'&&i%2===0){circle(.1,.019,main,x,y);continue}
      const size=style==='Delicate'?.068:style==='Pavé Set'?.042:necklace?.055+.038*(1-Math.sin(a))/2:.063;
      jewel(x,y,.032,style==='Prong Set'?size*1.12:size);
      if(style==='Pavé Set')jewel(x*.945,y*.945,.032,size*.78);
      if(style==='Fancy Bangles'&&i%2===0)jewel(x*1.08,y*1.08,.03,.035);
    }
    if(style==='Bow Tie')for(const side of [-1,1])for(let i=1;i<=(side===1?6:9);i++)jewel(side*.044+i*side*.012,-ry-i*.071,.03,.041);
    if(style==='Cluster'){for(const r of [.13,.22,.31]){circle(r,.017,main,0,-ry-.32);for(let i=0;i<24;i++){const a=i*Math.PI/12;jewel(r*Math.cos(a),-ry-.32+r*Math.sin(a),.02,.018)}}}
  }
  try{
    const data=await new GLTFExporter().parseAsync(scene,{binary:true}) as ArrayBuffer;
    return new Blob([data],{type:'model/gltf-binary'});
  }finally{
    scene.traverse(obj=>{if(obj instanceof T.Mesh)obj.geometry.dispose()});
    main.dispose();accent.dispose();gem.dispose();
  }
}
