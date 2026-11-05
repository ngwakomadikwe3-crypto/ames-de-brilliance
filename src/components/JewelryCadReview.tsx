"use client";

import { useCallback, useEffect, useState } from "react";
import EngineJewelryViewer from "./EngineJewelryViewer";
import type { JewelryProduct } from "@/lib/jewelry-workflow";
import type { CadJob } from "@/lib/cad-types";

const choices = [
  ["preserve", "Keep source materials"], ["unassigned", "Unassigned / neutral"],
  ["yellow_gold", "Yellow gold"], ["rose_gold", "Rose gold"], ["white_gold", "White gold"],
  ["silver", "Silver"], ["platinum", "Platinum"], ["diamond", "Diamond"],
  ["ruby", "Ruby"], ["sapphire", "Sapphire"], ["emerald", "Emerald"],
];
export default function JewelryCadReview({ product }: { product: JewelryProduct }) {
  const endpoint = `/api/jewelry-products/${encodeURIComponent(product.id)}/cad`;
  const sources = product.source_files.filter(file => file.fileId && file.kind === "source" && /\.(obj|stl|glb|fbx)$/i.test(file.filename));
  const [sourceId, setSourceId] = useState(sources[0]?.fileId || "");
  const [units, setUnits] = useState("unknown");
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [jobs, setJobs] = useState<CadJob[]>([]);
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [baseId, setBaseId] = useState<string | undefined>();
  const editable = ["submitted", "processing", "revision_requested"].includes(product.workflow_status);
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(endpoint, { signal, cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Preview status unavailable");
    if (!signal?.aborted) { setJobs(body.jobs); setOnline(body.worker.online); setError(""); }
  }, [endpoint]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try { await load(controller.signal); }
      catch (e) { if (!controller.signal.aborted) { setOnline(false); setError(e instanceof Error ? e.message : "Preview status unavailable"); } }
      finally { if (!controller.signal.aborted) timer = setTimeout(refresh, 4000); }
    };
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [load]);
  const matching = jobs.filter(job => job.sourceFileId === sourceId);
  const latest = matching[0];
  const ready = matching.find(job => job.status === "ready");
  const pending = jobs.some(job => ["queued", "processing"].includes(job.status));
  const fileUrl = (job: CadJob, file: string) => `${endpoint}/${job.id}/${file}`;
  async function generate() {
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceFileId: sourceId, units, assignments, materialsConfirmed: confirmed, ...(baseId ? { baseJobId: baseId } : {}) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not queue conversion");
      setConfirmed(false); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Conversion failed"); }
    finally { setBusy(false); }
  }
  function editMaterials() {
    if (!ready?.result) return;
    setBaseId(ready.id); setUnits(ready.units);
    setAssignments(Object.fromEntries(ready.result.components.map(part => [part.id, part.material])));
    setConfirmed(false);
  }
  return <section className="mt-5 border-t border-white/10 pt-4 space-y-3" data-cad-review>
    <h3 className="text-xs uppercase tracking-wider text-[#A6A6AB]">CAD preview and materials</h3>
    <p className="text-[11px] text-[#A6A6AB]">Preferred CAD original: Rhino / Matrix .3dm. Keep it with this product and select a companion GLB export for the preview. OBJ, STL and FBX exports also work through conversion. Direct 3DM/STEP conversion is not available yet.</p>
    <p role="status" className="text-[11px]">Conversion worker: {online ? "Available" : "Unavailable · contact the AMES operator"}</p>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    {!sources.length ? <p className="text-xs text-[#A6A6AB]">Upload a GLB, OBJ, STL or FBX export above to generate a preview. A 3DM original alone is retained for handoff and cannot be previewed yet.</p> : <>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-[11px]">Source design<select value={sourceId} disabled={busy || pending} onChange={e => { setSourceId(e.target.value); setAssignments({}); setBaseId(undefined); setConfirmed(false); }} className="field-input w-full mt-1">
          <option value="">Choose source</option>{sources.map(file => <option key={file.fileId} value={file.fileId}>{file.filename}</option>)}
        </select></label>
        <label className="text-[11px]">Declared source units<select value={units} disabled={busy || pending} onChange={e => { setUnits(e.target.value); setConfirmed(false); }} className="field-input w-full mt-1">
          {[['unknown', 'Not confirmed'], ['mm', 'Millimeters'], ['cm', 'Centimeters'], ['m', 'Meters'], ['in', 'Inches']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      </div>
      {latest && <p role="status" className="text-[11px]">Latest conversion: {latest.status}{latest.error ? ` · ${latest.error}` : ""}</p>}
      {ready?.result && <>
        {latest?.id !== ready.id && <p className="text-[11px] text-[#A6A6AB]">Showing the previous successful preview until the new conversion finishes.</p>}
        <div className="h-80 rounded-lg overflow-hidden bg-[#1A1D21]">
          <EngineJewelryViewer key={ready.id} src={fileUrl(ready, "preview.glb")} poster={fileUrl(ready, "poster.png")} alt={`${product.name} · private CAD preview`} autoLoad opticsProfile="soft-studio" cameraPreset="three_quarter" zoom={0.92} style={{ width: "100%", height: "100%" }} />
        </div>
        <p className="text-[11px]">{ready.result.components.length} components · {ready.result.triangleCount.toLocaleString()} triangles · preview only</p>
        <button type="button" disabled={!editable || busy || pending} onClick={editMaterials} className="border border-white/20 rounded-md px-3 py-2 text-[11px] disabled:opacity-40">Review component materials</button>
        {baseId === ready.id && <div className="space-y-3">
          <p className="text-[11px] text-[#A6A6AB]">Assign only materials you can identify. Missing stones are not created. If a mesh combines metal and stones, export separate named components from CAD.</p>
          {ready.result.components.map(part => <label key={part.id} className="block text-[11px]">{part.name} · {part.id}<span className="block text-[#A6A6AB]">Source: {part.originalMaterials.join(", ") || "No material supplied"}</span>
            <select value={assignments[part.id] || "preserve"} disabled={busy || pending || !editable} onChange={e => { setAssignments(current => ({ ...current, [part.id]: e.target.value })); setConfirmed(false); }} className="field-input w-full mt-1">
              {choices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>)}
          <label className="flex items-start gap-2 text-[11px]"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I confirm these material choices for this preview. This does not approve publication or certify the piece.</label>
        </div>}
        <ul className="list-disc pl-4 text-[11px] text-[#A6A6AB]">{ready.result.limitations.map(item => <li key={item}>{item}</li>)}</ul>
        <div className="flex gap-4 text-[11px] underline"><a href={fileUrl(ready, "preview.glb")} download="preview.glb">Download preview geometry</a><a href={fileUrl(ready, "poster.png")} download="poster.png">Download product render</a><a href={fileUrl(ready, "result.json")}>Conversion report</a></div>
      </>}
      <button type="button" onClick={generate} disabled={!editable || busy || pending || !online || !sourceId || (!!baseId && !confirmed)} className="px-3 py-2 text-[11px] border border-white/20 rounded-md disabled:opacity-40">{busy ? "Queuing…" : pending ? "Converting…" : baseId ? "Generate with confirmed materials" : "Generate 3D preview"}</button>
      <p className="text-[10px] text-[#A6A6AB]">Previews remain private and travel with the handoff manifest. Technical review, visual approval and content-pack publication are still required.</p>
    </>}
  </section>;
}
