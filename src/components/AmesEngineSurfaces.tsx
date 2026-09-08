"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createAssetRegistry,mountBoutiqueViewer,type AmesIntegration,type BoutiqueMode } from "@ames/engine";
import { useCustomer,customerRequest } from './CustomerState';

function useEngineSurface(integration: AmesIntegration | null, kind: "boutique" | "stone-tray", initialAssetId?: string, enabled = true) {
  const customer=useCustomer();
  const registry=useMemo(()=>createAssetRegistry(customer.catalog),[customer.catalog]);
  const customerRef=useRef(customer);customerRef.current=customer;
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !integration || !ref.current || !customer.ready) return;
    let mounted: { dispose(): Promise<void> } | undefined;
    let cancelled = false;
    const started = performance.now();
    setError(null);
    const host = ref.current;
    const viewer={registry,access:{userId:customer.user?.id||null,entitlements:{canAccess:async(_userId:string|null,assetId:string)=>!!(await customerRequest('access/'+encodeURIComponent(assetId))).granted},delivery:{resolve:async(_userId:string|null,assetId:string)=>customerRequest('delivery/'+encodeURIComponent(assetId),'POST',{})}}};
    let hydrating=false,off:(()=>void)|undefined;
    const promise = kind === "boutique"
      ? mountBoutiqueViewer(host, { viewer,initialAssetId:initialAssetId||registry.list().find(a=>a.category!=='stone')?.id,
          onFavorite:async(asset,favorite,signal)=>{if(hydrating)return;await customerRequest('favorites',favorite?'PUT':'DELETE',{assetId:asset.id},signal);await customerRef.current.reloadState();},
          onCompare:async(asset,signal)=>{await customerRequest('events','POST',{type:'COMPARED',assetId:asset.id},signal);},
          onRequestAccess:async()=>{window.location.assign('/account');} })
      : integration.mountStoneTray(host, { viewer,initialAssetId });
    promise.then(async (value) => {
      if (cancelled) { await value.dispose(); return; }
      mounted = value;
      if('mode' in value && 'toggleFavorite' in value.mode){
        const mode=value.mode as BoutiqueMode;let lastId:string|null=null;
        const hydrate=()=>{const id=mode.state.product?.id;if(!id||id===lastId)return;lastId=id;
          if(customerRef.current.state.favorites.some(a=>a.assetId===id)&&!mode.state.favorite){queueMicrotask(async()=>{if(cancelled||mode.state.product?.id!==id)return;hydrating=true;try{await mode.toggleFavorite();}catch{/* A switched/disposed presentation cancels hydration. */}finally{hydrating=false;}});}
        };off=mode.subscribe(hydrate);hydrate();
      }
      performance.measure(`ames-${kind}-mount-load`, { start: started, end: performance.now() });
    }).catch((cause) => {
      if (!cancelled) {
        setError(cause instanceof Error ? cause.message : String(cause));
        // Host logging hook deliberately excludes raw errors, URLs, tokens and chat content.
        window.dispatchEvent(new CustomEvent('ames:diagnostic', { detail: { code: 'VIEWER_MOUNT_FAILED', surface: kind } }));
      }
    });
    return () => { cancelled = true; off?.();void mounted?.dispose(); };
  }, [integration, kind, initialAssetId,registry,customer.ready,customer.user?.id,enabled]);
  return { ref, error };
}

export function AmesBoutiqueSurface({ integration, active = true }: { integration: AmesIntegration | null; active?: boolean }) {
  // Startup profiling found an unnecessary offscreen WebGL context before Chat.
  // Mount on first Boutique visit, then retain the viewer and its existing state.
  const [visited,setVisited]=useState(active);
  useEffect(()=>{if(active)setVisited(true);},[active]);
  const surface = useEngineSurface(integration, "boutique",undefined,visited);
  return <div className="ames-engine-boutique-shell"><div ref={surface.ref} className="ames-engine-boutique-mount" />{surface.error && <p role="status">{surface.error}</p>}</div>;
}

export function AmesStoneTraySurface({ integration, assetId = "stone-001" }: { integration: AmesIntegration | null; assetId?: string }) {
  const customer=useCustomer();const [saveError,setSaveError]=useState<string|null>(null),[saving,setSaving]=useState(false);
  const surface = useEngineSurface(integration, "stone-tray", assetId);
  async function save(){if(!customer.user){window.location.assign('/account');return;}setSaving(true);setSaveError(null);try{const selected=surface.ref.current?.querySelector<HTMLSelectElement>('[data-stone]')?.value||assetId;await customerRequest('saved','PUT',{assetId:selected});await customer.reloadState();}catch(e){setSaveError(e instanceof Error?e.message:'Save failed');}finally{setSaving(false);}}
  return <div className="ames-engine-stone-tray"><div ref={surface.ref} className="ames-engine-stone-mount" />{surface.error && <p role="status">{surface.error}</p>}<button type="button" onClick={save} disabled={saving}>Save stone</button><span role="status">{saveError|| (customer.state.saved.some(a=>a.kind==='stone')?'Stone saved to your account':'')}</span></div>;
}
