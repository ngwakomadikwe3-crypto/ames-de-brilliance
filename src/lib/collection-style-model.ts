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
  if(shape==='Princess')cut.rotateX(Math.PI/2);cut.computeVertexNormals();
  function jewel(x:number,y:number,z:number,size:number,setting=style){
    const g=mesh(cut,gem,x,y,z);g.scale.setScalar(size);
    {
      g.userData.ames_optical_mode='closed-dielectric-visual';
      g.userData.ames_gemstone_id=coloured?'stone-tsavorite-garnet':'stone-diamond';
      if(shape!=='Princess'){
        g.userData.ames_cut=shape==='Pear'?'pear':'round';
        g.rotation.x=Math.PI/2;
        if(kind!=='ring')g.rotateOnWorldAxis(new T.Vector3(0,0,1),Math.atan2(y,x));
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
        for(const m of scene.children.slice(start)){m.position.applyAxisAngle(new T.Vector3(0,1,0),a);m.rotateOnWorldAxis(new T.Vector3(0,1,0),a)}
      }
    }
    scene.rotation.x=.42;
  }else{
    const necklace=kind==='necklace',rx=necklace?1.45:1.15,ry=necklace?1.65:.84;
    const count=style==='Delicate'?12:style==='Cluster'?22:necklace?60:style==='Prong Set'?36:46;
    const step=2*Math.PI/count;
    // necklaces fall as worn: round the back of the neck and dipping to a soft V at the front (the pear-fringe
    // necklace's line); bracelets stay an ellipse. angle = 3pi/2 is the front, pi/2 the clasp.
    const H=3.1,rz=1.35;
    const point=(angle:number,offset=0)=>{
      if(!necklace)return new T.Vector3((rx+offset)*Math.cos(angle),(ry+offset)*Math.sin(angle),0);
      const phi=angle-1.5*Math.PI,dip=((1+Math.cos(phi))/2)**3;
      return new T.Vector3((rx+offset)*Math.sin(phi),H/2-H*dip,(rz+offset)*Math.cos(phi));
    };
    const bottom=point(1.5*Math.PI).y;
    const nodes:T.Group[]=[];
    let total=0;
    for(let i=0;i<count;i++){
      const angle=Math.PI/2+(i+.5)*step;
      const start=point(angle-step/2),end=point(angle+step/2);
      total+=start.distanceTo(end);
      const link=new T.Group();
      link.position.copy(point(angle));
      const tangent=end.clone().sub(start).normalize(),out=point(angle,.1).sub(point(angle)).normalize(),normal=necklace?tangent.clone().cross(out).normalize():new T.Vector3(0,0,1);
      link.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(tangent,normal,tangent.clone().cross(normal)));
      link.userData.ames_link=i;
      scene.add(link);nodes.push(link);
      const offsets=['Channel Set','Fancy Bangles','Pavé Set'].includes(style)?[-.052,0,.052]:[0];
      for(const offset of offsets){
        const curve=new T.CatmullRomCurve3([point(angle-step/2,offset),point(angle,offset),point(angle+step/2,offset)]);
        const tube=mesh(new T.TubeGeometry(curve,5,offset?.022:style==='Delicate'?.016:.031,8,false),offset&&style==='Fancy Bangles'?accent:main);
        link.attach(tube);
      }
    }
    const mm=(necklace?420:180)/total;
    const length=total*mm;
    scene.userData.ames_bracelet={kind,lay:'hang',links:count,pitch:length/count,length_mm:length,width_mm:Math.round(mm*.14),clasp:'Box clasp'};
    for(let i=0;i<count;i++){
      const a=Math.PI/2+(i+.5)*step,P=point(a),x=P.x,y=P.y,z0=necklace?P.z:0;
      if(style==='Cluster'&&i%2===0){nodes[i].attach(circle(.1,.019,main,x,y,z0));continue}
      const first=scene.children.length;
      const size=style==='Delicate'?.068:style==='Pavé Set'?.042:necklace?.055+.038*(1-Math.sin(a))/2:.063;
      jewel(x,y,z0+.032,style==='Prong Set'?size*1.12:size);
      if(style==='Pavé Set'){const q=necklace?point(a,-.08):new T.Vector3(x*.945,y*.945,0);jewel(q.x,q.y,q.z+.032,size*.78)}
      if(style==='Fancy Bangles'&&i%2===0){const q=necklace?point(a,.12):new T.Vector3(x*1.08,y*1.08,0);jewel(q.x,q.y,q.z+.03,.035)}
      for(const part of scene.children.slice(first))nodes[i].attach(part);
    }
    const by=necklace?bottom:-ry,bz=necklace?rz:0;
    if(style==='Bow Tie')for(const side of [-1,1])for(let i=1;i<=(side===1?6:9);i++)jewel(side*.044+i*side*.012,by-i*.071,bz+.03,.041);
    if(style==='Cluster'){for(const r of [.13,.22,.31]){circle(r,.017,main,0,by-.32,bz);for(let i=0;i<24;i++){const a=i*Math.PI/12;jewel(r*Math.cos(a),by-.32+r*Math.sin(a),bz+.02,.018)}}}
    // Keep each stone, setting and pendant on its own section while the clasp opens.
    for(const part of [...scene.children]){
      if(part instanceof T.Group)continue;
      // (a necklace's drape is no ellipse: the section is the nearest link)
      const index=necklace?nodes.reduce((best,n,k)=>n.position.distanceToSquared(part.position)<nodes[best].position.distanceToSquared(part.position)?k:best,0)
        :Math.min(count-1,Math.floor(((Math.atan2(part.position.y/ry,part.position.x/rx)-Math.PI/2+2*Math.PI)%(2*Math.PI))/step));
      nodes[index].attach(part);
    }
    for(const [index,span] of [[0,.10],[count-1,.065]]){
      const top=necklace?point(Math.PI/2):new T.Vector3(0,ry,0),clasp=mesh(new T.BoxGeometry(span,.075,.045),main,0,top.y,top.z+.025);   // at the back of the neck
      clasp.position.x=index===0?-span/2:span/2;
      nodes[index].attach(clasp);
    }
    for(const [index,node] of nodes.entries()){
      const angle=Math.PI/2+(index+.5)*step;
      const anchor=(a:number,offset:number)=>node.worldToLocal(point(a,offset)).multiplyScalar(mm).toArray();
      for(const [railIndex,part] of node.children.entries()){
        const offsets=['Channel Set','Fancy Bangles','Pavé Set'].includes(style)?[-.052,0,.052]:[0];
        if(railIndex>=offsets.length)break;
        const offset=offsets[railIndex];
        part.userData.ames_rail_joint={start:anchor(angle-step/2,offset),end:anchor(angle+step/2,offset),radius:mm*(offset?.022:style==='Delicate'?.016:.031)};
      }
      node.position.multiplyScalar(mm);
      for(const part of node.children){part.position.multiplyScalar(mm);part.scale.multiplyScalar(mm)}
    }
  }
  try{
    const data=await new GLTFExporter().parseAsync(scene,{binary:true}) as ArrayBuffer;
    return new Blob([data],{type:'model/gltf-binary'});
  }finally{
    scene.traverse(obj=>{if(obj instanceof T.Mesh)obj.geometry.dispose()});
    main.dispose();accent.dispose();gem.dispose();
  }
}
