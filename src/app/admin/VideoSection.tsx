"use client";
import {useEffect,useState} from 'react';
type Row=Record<string,any>;
const empty={title:'',caption:'',videoFileId:'',thumbnailFileId:'',productAssetId:'',status:'DRAFT',featured:false,sortOrder:0};
export default function VideoSection(){
 const [rows,setRows]=useState<Row[]>([]),[products,setProducts]=useState<Row[]>([]),[form,setForm]=useState<Row>({...empty}),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const request=async(url:string,options?:RequestInit)=>{const r=await fetch(url,{cache:'no-store',...options});const data=await r.json();if(!r.ok)throw new Error(data.error||'Request failed');return data;};
 const reload=async()=>setRows(await request('/api/videos'));
 useEffect(()=>{Promise.all([reload(),request('/api/customer/catalog').then(d=>setProducts(d.assets.filter((a:Row)=>a.category!=='stone'&&['PUBLIC','public'].includes(a.accessTier))))]).catch(e=>setMessage(e.message));},[]);
 async function upload(file:File|undefined,kind:string){if(!file)return;setBusy(true);setMessage('');try{if(file.size>4*1024*1024)throw new Error('Upload limit is 4 MB. Compress this film before uploading.');const data=new FormData();data.set('file',file);data.set('kind',kind);const result=await request('/api/videos/upload',{method:'POST',body:data});setForm(v=>({...v,[kind==='video'?'videoFileId':'thumbnailFileId']:result.filename}));}catch(e:any){setMessage(e.message);}finally{setBusy(false);}}
 async function save(status:string){setBusy(true);setMessage('');try{const result=await request('/api/videos',{method:form.id?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,status})});setForm(result);await reload();setMessage('Video saved.');}catch(e:any){setMessage(e.message);}finally{setBusy(false);}}
 async function remove(){setBusy(true);try{await request('/api/videos?id='+encodeURIComponent(form.id),{method:'DELETE'});setForm({...empty});await reload();}catch(e:any){setMessage(e.message);}finally{setBusy(false);}}
 return <section className="ames-admin-video"><h2>Video</h2><p>Private uploads, up to 4 MB each. Publish to show a film on Video.</p><button disabled={busy} onClick={()=>setForm({...empty})}>New video</button><div style={{display:'grid',gap:12,gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))'}}>
 <div>{rows.map(v=><button key={v.id} style={{display:'block',padding:10}} onClick={()=>setForm(v)}>{v.title||v.caption||'Untitled'} / {v.status}</button>)}</div>
 <fieldset disabled={busy} style={{minWidth:0,border:'1px solid #303840',padding:16}}><legend>{form.id?'Edit video':'New video'}</legend>
 <label>Video file<input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={e=>upload(e.target.files?.[0],'video')}/></label>
 <label>Thumbnail (optional)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>upload(e.target.files?.[0],'image')}/></label>
 {form.videoFileId&&<video controls playsInline preload="metadata" src={'/api/videos/files/'+form.videoFileId} poster={form.thumbnailFileId?'/api/videos/files/'+form.thumbnailFileId:undefined} style={{width:'100%',maxHeight:300}}/>}
 <label>Title (optional)<input value={form.title||''} maxLength={180} onChange={e=>setForm({...form,title:e.target.value})}/></label>
 <label>Caption<textarea required maxLength={500} value={form.caption||''} onChange={e=>setForm({...form,caption:e.target.value})}/></label>
 <label>Approved product<select value={form.productAssetId||''} onChange={e=>setForm({...form,productAssetId:e.target.value})}><option value="">No product link</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 <label><input type="checkbox" checked={form.featured===true} onChange={e=>setForm({...form,featured:e.target.checked})}/> Featured</label>
 <label>Sort order<input type="number" value={form.sortOrder||0} onChange={e=>setForm({...form,sortOrder:Number(e.target.value)})}/></label>
 <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>{['DRAFT','PUBLISHED','ARCHIVED'].map(status=><button key={status} onClick={()=>save(status)}>{status==='DRAFT'?'Save draft / unpublish':status==='PUBLISHED'?'Publish':'Archive'}</button>)}{form.id&&form.status==='ARCHIVED'&&<button onClick={remove}>Delete archived record</button>}</div>
 </fieldset></div>{message&&<p role="status">{message}</p>}<style jsx>{`label{display:block;margin:12px 0}input:not([type=checkbox]),textarea,select{display:block;width:100%;padding:8px;background:#151b20;color:#eef2f6;border:1px solid #3b444c}button{padding:8px;border:1px solid #3b444c}section{margin:28px 0}`}</style></section>;
}
