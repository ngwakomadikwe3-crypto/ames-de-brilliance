"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createAssetRegistry,mountBoutiqueViewer,type AmesIntegration,type BoutiqueMode } from "@ames/engine";
import { useCustomer,customerRequest } from './CustomerState';
import { createAMESDiamondMaterial } from '@/three/AMESDiamondMaterial';
import { createAMESStoneStage } from '@/three/AMESStoneStage';
import BoutiqueJewelryStage from './jewelry/BoutiqueJewelryStage';
import { Mesh, Vector3, type Texture } from 'three';

function useEngineSurface(integration: AmesIntegration | null, kind: "boutique" | "stone-tray", initialAssetId?: string, enabled = true, gem = "diamond", attempt = 0) {
  const customer=useCustomer();
  const registry=useMemo(()=>createAssetRegistry(customer.catalog),[customer.catalog]);
  const customerRef=useRef(customer);customerRef.current=customer;
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!enabled || !integration || !ref.current || !customer.ready) return;
    let mounted: { dispose(): Promise<void> } | undefined;
    let stoneBackdrop: Texture | undefined;
    let cancelled = false;
    const started = performance.now();
    setError(null);
    setReady(false);
    // Each mount owns its host. A late dispose cannot remove a newer canvas.
    const root = ref.current;
    const host = document.createElement("div");
    root.replaceChildren(host);
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
        host.dataset.amesRenderer = gem === "diamond" ? "ames-chat-facet-transport" : "ames-colored-gem-preview";
        stoneBackdrop = createAMESStoneStage();
        value.viewer.engine.scene.background = stoneBackdrop;
        const { camera, target } = value.viewer.engine;
        const distance = camera.position.distanceTo(target);
        camera.position.copy(new Vector3(0, 1, 0.22).normalize().multiplyScalar(distance).add(target));
        camera.lookAt(target);
        camera.updateMatrixWorld();
        const scene = value.viewer.engine.model?.asset.scene;
        if (!scene) throw new Error("Stone unavailable");
        scene?.traverse((object) => {
          if (!('isMesh' in object) || !object.isMesh) return;
          const mesh = object as Mesh;
          const previous = mesh.material;
          if (gem === "diamond" && previous && !Array.isArray(previous) && typeof (previous as { dispose?: () => void }).dispose === "function") (previous as { dispose: () => void }).dispose();
          if (gem === "diamond") {
            const environment = value.viewer.engine.scene.environment;
            if (!environment) throw new Error("Stone lighting unavailable");
            mesh.material = createAMESDiamondMaterial(mesh, environment);
          }
        });
      }
      if (kind === "stone-tray" && "execute" in value.mode) {
        if (gem !== "diamond") {
          const result = await value.mode.execute({ type: "SET_GEM", materialId: `gem:${gem}` });
          if (result.status !== "applied") throw new Error('Gem preview unavailable');
        }
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          await value.mode.execute({ type: "START_TURNTABLE", radiansPerSecond: 0.10 });
        }
      }
      if('mode' in value && 'toggleFavorite' in value.mode){
        const mode=value.mode as BoutiqueMode;let lastId:string|null=null;
        const hydrate=()=>{const id=mode.state.product?.id;if(!id||id===lastId)return;lastId=id;
          if(customerRef.current.state.favorites.some(a=>a.assetId===id)&&!mode.state.favorite){queueMicrotask(async()=>{if(cancelled||mode.state.product?.id!==id)return;hydrating=true;try{await mode.toggleFavorite();}catch{/* A switched/disposed presentation cancels hydration. */}finally{hydrating=false;}});}
        };off=mode.subscribe(hydrate);hydrate();
      }
      if (cancelled) return;
      setReady(true);
      performance.measure(`ames-${kind}-mount-load`, { start: started, end: performance.now() });
    }).catch((cause) => {
      if (!cancelled) {
        setError(cause instanceof Error ? cause.message : String(cause));
        // Host logging hook deliberately excludes raw errors, URLs, tokens and chat content.
        host.dataset.amesFallback = "renderer-failed";
        window.dispatchEvent(new CustomEvent('ames:diagnostic', { detail: { code: 'VIEWER_MOUNT_FAILED', surface: kind, fallback: 'none' } }));
      }
    });
    return () => { cancelled = true; off?.();host.remove();void mounted?.dispose();stoneBackdrop?.dispose(); };
  }, [integration, kind, initialAssetId,registry,customer.ready,customer.user?.id,enabled,gem,attempt]);
  return { ref, error, ready };
}

export function AmesBoutiqueSurface({ active = true }: { integration: AmesIntegration | null; active?: boolean }) {
  const [visited,setVisited]=useState(active);
  useEffect(()=>{if(active)setVisited(true);},[active]);
  return <div className="ames-engine-boutique-shell"><div className="ames-boutique-asset-stage">{visited && <BoutiqueJewelryStage active={active} />}</div></div>;
}

export function AmesStoneTraySurface({ integration, assetId = "stone-001", gem = "diamond" }: { integration: AmesIntegration | null; assetId?: string; gem?: string }) {
  const [attempt, setAttempt] = useState(0);
  const surface = useEngineSurface(integration, "stone-tray", assetId, true, gem, attempt);
  const identity: Record<string, string> = { "stone-001": "Round Brilliant", "stone-002": "Oval Brilliant", "stone-003": "Emerald Cut", "stone-004": "Pear Brilliant", "stone-005": "Asscher" };
  const gemName = gem.charAt(0).toUpperCase() + gem.slice(1);
  return <div className={`ames-engine-stone-tray${surface.ready ? " is-ready" : " is-loading"}`} aria-busy={!surface.ready && !surface.error} data-stone-presentation="canonical-ames-webgl" onPointerDown={e => e.stopPropagation()}>
    <div ref={surface.ref} className="ames-engine-stone-mount" aria-label={`${identity[assetId] || "Stone"}, drag to rotate, pinch or scroll to zoom`} />
    <p className="ames-stone-identity" aria-live="polite">{identity[assetId] || "AMES stone"}{' \u00b7 '}{gemName}{gem !== "diamond" ? " preview" : ""}</p>
    {!surface.ready && !surface.error && <p className="ames-stone-loading" role="status">Preparing your stone...</p>}
    {surface.error && <div className="ames-stone-error" role="status"><p>The stone could not load.</p><button onClick={() => setAttempt(value => value + 1)}>Try again</button></div>}
  </div>;
}
