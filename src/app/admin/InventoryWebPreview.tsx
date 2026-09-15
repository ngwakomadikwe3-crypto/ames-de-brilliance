"use client";
import {useState} from 'react';
import dynamic from 'next/dynamic';
const Stage=dynamic(()=>import('@/components/jewelry/BoutiqueJewelryStage'),{ssr:false});
export default function InventoryWebPreview({url,name}:{url:string;name:string}){const [open,setOpen]=useState(false);return <div><button onClick={()=>setOpen(!open)}>{open?'Close 3D preview':'Preview supplied web 3D'}</button>{open&&<div style={{height:320,position:'relative'}}><Stage modelUrl={url} name={name}/></div>}</div>;}
