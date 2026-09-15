"use client";
import { createContext,useContext,useEffect,useState,type ReactNode } from 'react';
import { canonicalAssetManifest,type AssetManifest } from '@ames/engine';
export type CustomerUser={id:string;name:string;email:string;admin:boolean};
export type CustomerState={favorites:{assetId:string}[];saved:{assetId:string;kind:string}[];designs:{designId:string;spec:unknown}[];profile?:{preferences?:Record<string,unknown>};entitlements:unknown[];subscriptions:unknown[]};
const empty:CustomerState={favorites:[],saved:[],designs:[],entitlements:[],subscriptions:[]};
export async function customerRequest(path:string,method='GET',value?:unknown,signal?:AbortSignal){const r=await fetch('/api/customer/'+path,{method,credentials:'same-origin',cache:'no-store',signal,headers:value?{'Content-Type':'application/json'}:undefined,body:value?JSON.stringify(value):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error||'Account service unavailable');return data;}
const Context=createContext<{user:CustomerUser|null;guest:boolean;state:CustomerState;catalog:AssetManifest;ready:boolean;error:string|null;reloadState:()=>Promise<void>}>({user:null,guest:false,state:empty,catalog:{schemaVersion:1,assets:canonicalAssetManifest.assets.filter(a=>a.category==='stone')},ready:false,error:null,reloadState:async()=>{}});
export function CustomerProvider({children}:{children:ReactNode}){
  const [user,setUser]=useState<CustomerUser|null>(null),[guest,setGuest]=useState(false),[state,setState]=useState(empty),[catalog,setCatalog]=useState<AssetManifest>({schemaVersion:1,assets:canonicalAssetManifest.assets.filter(a=>a.category==='stone')}),[ready,setReady]=useState(false),[error,setError]=useState<string|null>(null);
  async function reloadState(){setState(await customerRequest('state'));}
  useEffect(()=>{const controller=new AbortController();let active=true;(async()=>{try{
    const [account,manifest]=await Promise.all([
      customerRequest('session','GET',undefined,controller.signal),
      customerRequest('catalog','GET',undefined,controller.signal),
    ]);if(!active)return;setUser(account.user);setGuest(account.guest===true);
    const merged=new Map(canonicalAssetManifest.assets.filter(a=>a.category==='stone').map(a=>[a.id,a]));for(const a of manifest.assets)merged.set(a.id,a);setCatalog({schemaVersion:1,assets:[...merged.values()]});
    if(account.user||account.guest){const data=await customerRequest('state','GET',undefined,controller.signal);if(active)setState(data);}
  }catch(e){if(active)setError(e instanceof Error?e.message:'Account service unavailable');}finally{if(active)setReady(true);}})();return()=>{active=false;controller.abort();};},[]);
  return <Context.Provider value={{user,guest,state,catalog,ready,error,reloadState}}>{children}</Context.Provider>;
}
export const useCustomer=()=>useContext(Context);
