'use client';
import {useEffect,useState} from 'react';
import HandClasp from './HandClasp';
import {readSavedHand,replaceSavedHand,deleteSavedHand,fitFromCamera} from '../lib/fitting-hand';
export default function SavedHandPanel({wrist=false,onScanning}:{wrist?:boolean;onScanning?:(active:boolean)=>void}){
 const [saved,setSaved]=useState(false),[confirm,setConfirm]=useState(false),[notice,setNotice]=useState(''),[version,setVersion]=useState(0);
 useEffect(()=>{
   const refresh=()=>{setSaved(!!readSavedHand());setConfirm(false);setVersion(v=>v+1)};
   const storage=(e:StorageEvent)=>{if(e.key==='ames-saved-hand'||!e.key)refresh()};
   refresh();window.addEventListener('ames-hand-fit',refresh);window.addEventListener('storage',storage);
   return ()=>{window.removeEventListener('ames-hand-fit',refresh);window.removeEventListener('storage',storage)};
 },[]);
 return <section aria-label="Your hand" className="space-y-1 p-2 text-center text-xs"><strong>Your hand</strong>
 <p>Your hand scan stays on this device and is only used for try-on.</p>
 {confirm?<div role="group" aria-label="Confirm hand deletion"><p>This removes your saved hand. You can scan a new one anytime.</p>
 <button type="button" className="min-h-10 px-2 underline" onClick={()=>{try{deleteSavedHand();setNotice('Saved hand deleted.')}catch{setNotice('Deletion failed. Try again.')}}}>Confirm delete</button>
 <button autoFocus type="button" className="min-h-10 px-2 underline" onClick={()=>setConfirm(false)}>Cancel</button></div>:<>
 <HandClasp onActivity={onScanning} key={version} captureLabel={saved?'Re-scan hand':'Scan your hand'} onCapture={(points,colour,outline)=>{
   const fit=fitFromCamera(points,1,0,wrist);if(!fit)return false;fit.outline=outline;
   try{replaceSavedHand(fit,colour);setNotice('New hand saved.');return true}catch{setNotice('Could not save this scan. Check device storage.');return false}
 }}/>
 {saved&&<button type="button" className="min-h-10 px-2 underline" onClick={()=>setConfirm(true)}><span aria-hidden="true">🗑 </span>Delete saved hand</button>}</>}
 {notice&&<p role="status">{notice}</p>}</section>;
}