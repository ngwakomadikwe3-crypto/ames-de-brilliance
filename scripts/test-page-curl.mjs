import test from 'node:test';
import assert from 'node:assert/strict';
import { pageCurlGeometry } from '../src/lib/page-curl.ts';

test('fold begins with the full sheet and advances across desktop and mobile without invalid coordinates',()=>{
 for(const [w,h] of [[1440,1000],[390,844],[844,390]]) {
  const start=pageCurlGeometry(w,h,0);
  assert.match(start.clipPath,/100% 100%/);
  for(const progress of [0,.1,.3,.5,.8,1])for(const backward of [false,true]) {
   const geometry=pageCurlGeometry(w,h,progress,backward);
   assert.ok(!JSON.stringify(geometry).match(/NaN|Infinity/));
   assert.ok(geometry.clipPath.startsWith('polygon('));
  }
  assert.notEqual(start.clipPath,pageCurlGeometry(w,h,.5).clipPath);
 }
});
test('reverse turn mirrors the same folded sheet and progress is bounded',()=>{
 const forward=pageCurlGeometry(1000,800,.4),backward=pageCurlGeometry(1000,800,.4,true);
 const points=s=>s.split(' ').map(p=>p.split(',').map(Number));
 points(forward.back).forEach(([x,y],i)=>{const [rx,ry]=points(backward.back)[i];assert.ok(Math.abs(x+rx-1000)<.02);assert.equal(y,ry)});
 assert.deepEqual(pageCurlGeometry(1000,800,-1),pageCurlGeometry(1000,800,0));
 assert.deepEqual(pageCurlGeometry(1000,800,2),pageCurlGeometry(1000,800,1));
});
