"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createAssetRegistry,mountBoutiqueViewer,type AmesIntegration,type BoutiqueMode } from "@ames/engine";
import { useCustomer,customerRequest } from './CustomerState';
import { createAMESDiamondMaterial } from '@/three/AMESDiamondMaterial';
import JewelryViewer from './jewelry/JewelryViewer';

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
    host.dataset.amesRenderer = "ames-webgl-gem-material";
    host.dataset.amesFallback = "none";
    host.dataset.amesAssetId = initialAssetId || "";
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
      if (kind === "stone-tray") {
        const scene = value.viewer.engine.model?.asset.scene;
        scene?.traverse((object) => {
          if (!('isMesh' in object) || !object.isMesh) return;
          const mesh = object as unknown as { material: unknown; geometry?: { computeVertexNormals?: () => void } };
          const previous = mesh.material;
          if (previous && !Array.isArray(previous) && typeof (previous as { dispose?: () => void }).dispose === "function") (previous as { dispose: () => void }).dispose();
          mesh.material = createAMESDiamondMaterial();
        });
      }
      // Customer presentation: keep the stone alive with a restrained idle turn.
      // The engine remains the sole owner of camera, controls, optics and disposal.
      const stoneMode = kind === "stone-tray" && "mode" in value ? (value as { mode?: { toggleTurntable?: () => Promise<unknown> } }).mode : undefined;
      if (stoneMode?.toggleTurntable) {
        void stoneMode.toggleTurntable().catch(() => undefined);
      }
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
        host.dataset.amesFallback = "renderer-failed";
        window.dispatchEvent(new CustomEvent('ames:diagnostic', { detail: { code: 'VIEWER_MOUNT_FAILED', surface: kind, fallback: 'none' } }));
      }
    });
    return () => { cancelled = true; off?.();void mounted?.dispose(); };
  }, [integration, kind, initialAssetId,registry,customer.ready,customer.user?.id,enabled]);
  return { ref, error };
}

export function AmesBoutiqueSurface({ integration, active = true }: { integration: AmesIntegration | null; active?: boolean }) {
  const customer = useCustomer();
  // Startup profiling found an unnecessary offscreen WebGL context before Chat.
  // Mount on first Boutique visit, then retain the viewer and its existing state.
  const [visited,setVisited]=useState(active);
  useEffect(()=>{if(active)setVisited(true);},[active]);
  const surface = useEngineSurface(integration, "boutique",undefined,visited);
  const hasJewelry = customer.catalog.assets.some((asset) => asset.category !== 'stone');
  return <div className="ames-engine-boutique-shell">
    {!hasJewelry && <div className="ames-boutique-empty-stage" aria-label="AMES jewelry preview"><JewelryViewer modelUrl="placeholder:ames-signature-solitaire" caption="AMES current edit" /></div>}
    <div ref={surface.ref} className={`ames-engine-boutique-mount${hasJewelry ? "" : " is-empty"}`} />{surface.error && <p role="status">{surface.error}</p>}
  </div>;
}

export function AmesStoneTraySurface({ integration, assetId = "stone-001" }: { integration: AmesIntegration | null; assetId?: string }) {
  const customer=useCustomer();const [saveError,setSaveError]=useState<string|null>(null),[saving,setSaving]=useState(false);
  const surface = useEngineSurface(integration, "stone-tray", assetId);
  async function save(){if(!customer.user){window.location.assign('/account');return;}setSaving(true);setSaveError(null);try{const selected=surface.ref.current?.querySelector<HTMLSelectElement>('[data-stone]')?.value||assetId;await customerRequest('saved','PUT',{assetId:selected});await customer.reloadState();}catch(e){setSaveError(e instanceof Error?e.message:'Save failed');}finally{setSaving(false);}}
  const identity: Record<string, string> = { "stone-001": "Round Brilliant", "stone-002": "Oval Brilliant", "stone-003": "Emerald Cut", "stone-004": "Pear Brilliant", "stone-005": "Asscher Cut" };
  return <div className="ames-engine-stone-tray" data-stone-presentation="canonical-ames-webgl">
    <div ref={surface.ref} className="ames-engine-stone-mount" />
    <div className="ames-stone-identity"><strong>{identity[assetId] || "AMES stone"}</strong><span>Diamond</span></div>
    {surface.error && <p role="status">AMES gemstone renderer unavailable: {surface.error}</p>}
    <div className="ames-stone-actions"><button type="button" onClick={save} disabled={saving} aria-label={`Save ${identity[assetId] || "stone"}`}>{customer.state.saved.some(a=>a.assetId===assetId) ? "Saved" : "Save"}</button><span role="status">{saveError}</span></div>
  </div>;
}
