"use client";
import { createContext,useContext,useEffect,useState,type ReactNode } from 'react';
import { canonicalAssetManifest,type AssetManifest } from '@ames/engine';
export type CustomerUser={id:string;name:string;email:string;admin:boolean};
export type CustomerState={favorites:{assetId:string}[];saved:{assetId:string;kind:string}[];designs:{designId:string;spec:unknown}[];profile?:{preferences?:Record<string,unknown>;photo?:{fileId:string;uploadedAt:string}|null};entitlements:unknown[];subscriptions:unknown[]};
const empty:CustomerState={favorites:[],saved:[],designs:[],entitlements:[],subscriptions:[]};
export async function customerRequest(path:string,method='GET',value?:unknown,signal?:AbortSignal){const r=await fetch('/api/customer/'+path,{method,credentials:'same-origin',cache:'no-store',signal,headers:value?{'Content-Type':'application/json'}:undefined,body:value?JSON.stringify(value):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error||'Account service unavailable');return data;}
const Context=createContext<{user:CustomerUser|null;guest:boolean;access:{admin:boolean;jeweller:boolean};state:CustomerState;catalog:AssetManifest;ready:boolean;error:string|null;reloadState:()=>Promise<void>}>({user:null,guest:false,access:{admin:false,jeweller:false},state:empty,catalog:{schemaVersion:1,assets:canonicalAssetManifest.assets.filter(a=>a.category==='stone')},ready:false,error:null,reloadState:async()=>{}});
export function CustomerProvider({children}:{children:ReactNode}){
  const [access,setAccess]=useState({admin:false,jeweller:false}),[catalogError,setCatalogError]=useState<string|null>(null);
  const [user,setUser]=useState<CustomerUser|null>(null),[guest,setGuest]=useState(false),[state,setState]=useState(empty),[catalog,setCatalog]=useState<AssetManifest>({schemaVersion:1,assets:canonicalAssetManifest.assets.filter(a=>a.category==='stone')}),[ready,setReady]=useState(false),[error,setError]=useState<string|null>(null);
  async function reloadState(){setState(await customerRequest('state'));}
  useEffect(()=>{const controller=new AbortController();let active=true;
    async function account(){try{const a=await customerRequest('session','GET',undefined,controller.signal);if(!active)return;setError(null);setUser(a.user);setGuest(a.guest===true);setAccess({admin:a.user?.admin===true,jeweller:a.access?.jeweller===true});if(a.user||a.guest){try{const data=await customerRequest('state','GET',undefined,controller.signal);if(active)setState(data);}catch(e){if(active)setError(e instanceof Error?e.message:'Profile unavailable');}}else setState(empty);}catch(e){if(active){setUser(null);setGuest(false);setState(empty);setAccess({admin:false,jeweller:false});setError(e instanceof Error?e.message:'Account service unavailable');}}}
    async function manifest(){try{const data=await customerRequest('catalog','GET',undefined,controller.signal);if(!active)return;setCatalogError(null);const merged=new Map(canonicalAssetManifest.assets.filter(a=>a.category==='stone').map(a=>[a.id,a]));for(const a of data.assets)merged.set(a.id,a);setCatalog({schemaVersion:1,assets:[...merged.values()]});}catch(e){if(active)setCatalogError(e instanceof Error?e.message:'Catalog unavailable');}}
    Promise.allSettled([account(),manifest()]).then(()=>{if(active)setReady(true);});
    const focus=()=>{void account();};window.addEventListener('focus',focus);
    return()=>{active=false;controller.abort();window.removeEventListener('focus',focus);};
  },[]);
  return <Context.Provider value={{user,guest,access,state,catalog,ready,error:error||catalogError,reloadState}}>{children}</Context.Provider>;
}
export const useCustomer=()=>useContext(Context);
