import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInventoryUpload} from '../src/lib/customer/inventory-upload.mjs';
import {createCustomerService} from '../src/lib/customer/service.mjs';
import {fixture} from './jeweller-fixture.mjs';
const obj=Buffer.from('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
test('CAD content validation rejects scripts, mismatched types and unsupported CAD',()=>{
 assert.equal(validateInventoryUpload({name:'piece.obj',type:'text/plain'},obj,'cad').extension,'obj');
 for(const [name,type,bytes] of [['piece.obj','text/plain',Buffer.from('<script>alert(1)</script>')],['piece.obj','text/html',obj],['piece.exe','application/octet-stream',obj],['piece.dwg','application/octet-stream',obj],['piece.dxf','text/plain',obj]])assert.throws(()=>validateInventoryUpload({name,type},bytes,'cad'));
});
test('web glTF accepts embedded resources and rejects external resource fetching',()=>{
 const check=model=>validateInventoryUpload({name:'piece.gltf',type:'model/gltf+json'},Buffer.from(JSON.stringify(model)),'gltf');
 assert.equal(check({asset:{version:'2.0'},buffers:[{uri:'data:application/octet-stream;base64,AAAA',byteLength:3}]}).mimeType,'model/gltf+json');
 for(const uri of ['https://example.test/a.bin','a.bin','data:text/html;base64,AAAA'])assert.throws(()=>check({asset:{version:'2.0'},buffers:[{uri}]}));
 assert.throws(()=>check({asset:{version:'1.0'}}));
});
test('CAD upload, trusted metadata, ownership and private downloads survive product approval',async()=>{
 const f=fixture();for(const user of ['alice','bob'])await f.gateway.put('jewellers',user+'-atelier',{kind:'JEWELLER_APPLICATION',email:user+'@example.test',businessName:user,verificationStatus:'VERIFIED'});
 let uploads=0;f.gateway.uploadMedia=async()=>({$id:'source-'+(++uploads)});f.gateway.stream=async()=>new Response(obj);
 const service=createCustomerService(f.config,f.gateway);
 const upload=async(who='alice',productId)=>{const data=new FormData();data.set('file',new File([obj],'piece.obj',{type:'text/plain'}));data.set('kind','cad');data.set('assetRole','cad');if(productId)data.set('productId',productId);return service.handle(new Request(f.config.origin+'/api/customer/jewellers/media',{method:'POST',headers:{origin:f.config.origin,...(who?{cookie:'__Host-ames_customer='+who+'-session'}:{})},body:data}));};
 assert.equal((await upload(null)).status,401);assert.equal((await upload('admin')).status,403);
 const r=await upload();assert.equal(r.status,201);const media=await r.json();assert.equal(media.visibility,'PRIVATE');assert.equal(media.fileName,'piece.obj');assert.equal(media.size,obj.length);assert.equal(media.uploadedBy,'alice');
 const draft={name:'Source test',category:'Rings',media:[{...media,visibility:'PUBLIC',uploadedBy:'forged'}]};
 const created=await f.request('jewellers/inventory','POST',draft);assert.equal(created.status,201);const {item}=await created.json();assert.equal(item.media[0].visibility,'PRIVATE');assert.equal(item.media[0].uploadedBy,'alice');assert.deepEqual(item.images,[]);assert.ok(!item.glb);
 assert.equal((await upload('bob',item.id)).status,404);
 assert.equal((await f.request('jewellers/inventory','POST',draft,'bob')).status,404);
 assert.equal((await f.request('jewellers/inventory','POST',{...draft,media:[{fileId:media.fileId,kind:'glb'}]})).status,400);
 const path='inventory-media/'+item.id+'/'+media.fileId;
 await f.request('admin/inventory','PUT',{inventoryId:item.id,status:'APPROVED'},'admin');
 assert.equal((await f.request(path,'GET',undefined,null)).status,401);assert.equal((await f.request(path,'GET',undefined,'bob')).status,404);
 for(const user of ['alice','admin']){const result=await f.request(path,'GET',undefined,user);assert.equal(result.status,200);assert.match(result.headers.get('content-disposition'),/^attachment;/);assert.equal(result.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(Buffer.from(await result.arrayBuffer()),obj);}
 const publicText=await(await f.request('catalog','GET',undefined,null)).text();assert.ok(!publicText.includes(media.fileId)&&!publicText.includes('piece.obj'));
});
