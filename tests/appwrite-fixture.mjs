// Test-only HTTP substitute for Appwrite. Never imported by production code.
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {canonicalAssetManifest} from '@ames/engine';
import {documentId} from '../src/lib/customer/appwrite.mjs';
export async function startFixture({glb=Buffer.from('fixture bytes'),ring=glb}={}){
 const rows=new Map(),sessions=new Map(),key=randomUUID(),password=randomUUID(),project='fixture',users=new Set(['alice','bob','admin']),bucketPermissions=[];
 const record=(a)=>({$id:documentId(a.id),$permissions:[],userId:'',assetId:a.id,kind:a.category,payload:JSON.stringify(a),updatedAt:new Date().toISOString()});
 for(const a of canonicalAssetManifest.assets){const row=record({...a,accessTier:'PUBLIC',status:'published',revision:1,storage:{bucketId:'media',fileId:a.id}});rows.set('catalog_assets:'+row.$id,row);}
 for(const [id,tier] of [['fixture-ring','PUBLIC'],['fixture-premium','PREMIUM']]){const row=record({...canonicalAssetManifest.assets[0],id,name:id,category:'ring',metalCompatibility:['platinum'],materialSlots:[{id:'metal',kind:'metal'},{id:'gem',kind:'gem'}],accessTier:tier,status:'published',revision:1,storage:{bucketId:'media',fileId:id}});rows.set('catalog_assets:'+row.$id,row);}
 const server=createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://localhost'),p=u.pathname.split('/').filter(Boolean);let data={};if(['POST','PUT','PATCH'].includes(req.method)){const chunks=[];for await(const c of req)chunks.push(c);data=JSON.parse(Buffer.concat(chunks).toString()||'{}');}
  const send=(v,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(v));};
  const deny=(code=401)=>send({message:'Fixture denied',code,type:'fixture_denied'},code);
  if(req.headers['x-appwrite-project']!==project)return deny();
  if(p[1]==='account'){
   if(req.method==='POST'&&p.length===2){const user=data.email.split('@')[0];if(users.has(user))return deny(409);if(data.password!==password)return deny();users.add(user);return send({$id:user,status:true},201);}
   if(req.method==='POST'&&p.at(-1)==='email'){if(req.headers['x-appwrite-key']!==key||data.password!==password)return deny();const user=data.email.split('@')[0];if(!users.has(user))return deny();const secret=randomUUID();sessions.set(secret,user);return send({$id:randomUUID(),userId:user,secret,expire:new Date(Date.now()+3600000).toISOString()});}
   const s=req.headers['x-appwrite-session'],user=sessions.get(s);if(!user)return deny();if(req.method==='DELETE'){sessions.delete(s);return send({});}return send({$id:user,status:true,name:user,email:user+'@example.test',labels:user==='admin'?['amesadmin']:[]});
  }
  if(req.headers['x-appwrite-key']!==key)return deny();
  if(p[1]==='databases'||p[1]==='tablesdb'){
   const collection=p[4],id=p[6],mapKey=collection+':'+id;
   if(p.length===5)return send({$id:collection,$permissions:[],documentSecurity:true,rowSecurity:true});
   if(req.method==='POST'){const recordId=data.rowId||data.documentId;const k=collection+':'+recordId;if(rows.has(k))return deny(409);const row={$id:recordId,$permissions:data.permissions,...data.data};rows.set(k,row);return send(row,201);}
   if(req.method==='PATCH'){if(!rows.has(mapKey))return deny(404);const row={...rows.get(mapKey),...data.data};rows.set(mapKey,row);return send(row);}
   if(req.method==='DELETE'){rows.delete(mapKey);return send({});}
   if(id)return rows.has(mapKey)?send(rows.get(mapKey)):deny(404);
   let result=[...rows].filter(([k])=>k.startsWith(collection+':')).map(([,v])=>v);let limit=25;
   for(const [k,v] of u.searchParams){if(!k.startsWith('queries'))continue;const q=JSON.parse(v);if(q.method==='equal')result=result.filter(r=>q.values.includes(r[q.attribute]));if(q.method==='limit')limit=q.values[0];if(q.method==='cursorAfter')result=result.slice(result.findIndex(r=>r.$id===q.values[0])+1);}
   return send({total:result.length,documents:result.slice(0,limit),rows:result.slice(0,limit)});
  }
  if(p[1]==='storage'){if(p.length===4)return send({$permissions:bucketPermissions,fileSecurity:true,enabled:true});if(p.at(-1)==='download'){res.writeHead(200,{'content-type':'model/gltf-binary'});return res.end(p[5]?.startsWith('fixture-')?ring:glb);}return send({$permissions:[],name:'fixture.glb',mimeType:'model/gltf-binary',sizeOriginal:glb.length});}
  return deny(404);
 }catch(e){res.writeHead(500);res.end(JSON.stringify({message:'Fixture protocol error',code:500}));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));return {endpoint:`http://127.0.0.1:${server.address().port}/v1`,project,key,password,rows,sessions,bucketPermissions,close:()=>new Promise(r=>server.close(r))};
}
