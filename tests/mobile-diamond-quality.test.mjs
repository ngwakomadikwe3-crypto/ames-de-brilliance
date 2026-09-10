import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Mesh, PerspectiveCamera, Texture } from 'three';
import { createAMESDiamondMaterial } from '../src/three/AMESDiamondMaterial.ts';

test('mobile resolution adapts to sustained frame loss, restores after multi-touch, and cleans up', () => {
  const names=['window','document','requestAnimationFrame','cancelAnimationFrame','performance','clearTimeout'];
  const original=Object.fromEntries(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const window=new EventTarget(), raf=new Map(), timers=new Map();
  let now=1000, id=0, ratio=1;
  Object.assign(window,{devicePixelRatio:3,setTimeout:fn=>{timers.set(++id,fn);return id;}});
  const globals={window,document:{hidden:false},performance:{now:()=>now},requestAnimationFrame:fn=>{raf.set(++id,fn);return id;},cancelAnimationFrame:id=>raf.delete(id),clearTimeout:id=>timers.delete(id)};
  for(const [name,value] of Object.entries(globals))Object.defineProperty(globalThis,name,{configurable:true,value});
  const mesh=new Mesh(new BoxGeometry()), environment=new Texture({height:1024}), camera=new PerspectiveCamera();
  const renderer={domElement:new EventTarget(),getPixelRatio:()=>ratio,setPixelRatio:value=>{ratio=value;}};
  let material;
  const flush=queue=>{const callbacks=[...queue.values()];queue.clear();callbacks.forEach(fn=>fn());};
  const frame=gap=>{now+=gap;mesh.onBeforeRender(renderer,null,camera);flush(raf);};
  const pointer=(target,type,pointerId)=>{const event=new Event(type);event.pointerId=pointerId;target.dispatchEvent(event);flush(raf);};
  try {
    material=createAMESDiamondMaterial(mesh,environment,true);
    frame(16);assert.equal(ratio,1.5);
    for(let i=0;i<110;i++)frame(34);
    assert.equal(ratio,1,'Sustained sub-40 FPS reduces resolution');
    for(let i=0;i<850;i++)frame(16);
    assert.equal(ratio,1.5,'Sustained headroom recovers quality with hysteresis');
    pointer(renderer.domElement,'pointerdown',1);pointer(renderer.domElement,'pointerdown',2);
    assert.equal(ratio,1);
    pointer(window,'pointerup',1);flush(timers);flush(raf);assert.equal(ratio,1);
    pointer(window,'pointercancel',2);flush(timers);flush(raf);assert.equal(ratio,1.5);
    material.dispose();pointer(renderer.domElement,'pointerdown',3);assert.equal(ratio,1.5);
    assert.equal(raf.size,0);assert.equal(timers.size,0);
  } finally {
    material?.dispose();mesh.geometry.dispose();environment.dispose();
    for(const name of names){if(original[name])Object.defineProperty(globalThis,name,original[name]);else delete globalThis[name];}
  }
});
