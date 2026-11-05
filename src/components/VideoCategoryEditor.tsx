"use client";
import {useState} from 'react';
import {VIDEO_INTERESTS,videoInterests,captionWithInterests,type VideoInterest} from '@/lib/video-interests';
import {readApiJson} from '@/lib/client-api';

export default function VideoCategoryEditor({id,caption,onSaved}:{id:string|number;caption:string;onSaved:(caption:string)=>void}) {
  const [selected,setSelected]=useState<VideoInterest[]>(()=>videoInterests([caption]));
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  async function save(){
    setBusy(true);setError('');setSaved(false);
    try {
      const next=captionWithInterests(caption,selected);
      await readApiJson(await fetch('/api/videos',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,caption:next})}),'Video categories could not be saved. Please try again.');
      onSaved(next);setSaved(true);
    } catch(e){setError(e instanceof Error?e.message:'Unable to save categories.');} finally{setBusy(false);}
  }
  return <fieldset className="mt-3" disabled={busy}><legend className="text-xs">Video categories</legend>
    <div className="mt-2 flex flex-wrap gap-3">{VIDEO_INTERESTS.map(item=><label key={item.id} className="flex min-h-10 items-center gap-2 text-xs"><input type="checkbox" checked={selected.includes(item.id)} onChange={e=>{setSaved(false);setSelected(current=>e.target.checked?[...current,item.id]:current.filter(id=>id!==item.id));}} />{item.label}</label>)}</div>
    <button type="button" onClick={save} className="min-h-10 rounded border border-current px-3 text-xs">{busy?'Saving…':'Save categories'}</button>
    {saved&&<p role="status" className="mt-1 text-xs">Categories saved.</p>}{error&&<p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
  </fieldset>;
}
