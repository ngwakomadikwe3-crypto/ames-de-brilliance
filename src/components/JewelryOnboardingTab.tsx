"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import ModelViewer from "./ModelViewer";
import type { JewelryAction, JewelryProduct, PackEvidence } from "@/lib/jewelry-workflow";

type Trader = { id: string; name: string; company?: string; status: string };
type Detail = { product: JewelryProduct; pack: PackEvidence | null; packError: string | null };
const api = "/api/jewelry-products";
const preview = (id: string, path: string) => `${api}/${encodeURIComponent(id)}/preview/${path.split("/").map(encodeURIComponent).join("/")}`;
const errorText = async (response: Response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
};

export default function JewelryOnboardingTab() {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [products, setProducts] = useState<JewelryProduct[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [traderId, setTraderId] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [existingAssetId, setExistingAssetId] = useState("");
  const [sourceMode, setSourceMode] = useState<"operator_handoff" | "cloud_source_upload">("operator_handoff");
  const [operatorFilename, setOperatorFilename] = useState("");
  const [operatorBytes, setOperatorBytes] = useState("");
  const [operatorSha256, setOperatorSha256] = useState("");
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const [vendorRows, productRows] = await Promise.all([
      fetch("/api/traders").then(errorText),
      fetch(api).then(errorText),
    ]);
    setTraders(vendorRows);
    setProducts(productRows);
  }, []);
  const reloadDetail = useCallback(async (id: string) => {
    if (!id) { setDetail(null); return; }
    setDetail(await fetch(`${api}/${encodeURIComponent(id)}`).then(errorText));
  }, []);
  useEffect(() => { reload().catch(e => setError(e.message)); }, [reload]);
  useEffect(() => { reloadDetail(selectedId).catch(e => setError(e.message)); }, [selectedId, reloadDetail]);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const created: JewelryProduct = await fetch(api, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traderId, name, category, sourceMode, ...(existingAssetId.trim() ? { assetId: existingAssetId.trim() } : {}) }),
      }).then(errorText);
      setName(""); setCategory(""); setExistingAssetId("");
      await reload(); setSelectedId(created.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Creation failed"); }
    finally { setBusy(false); }
  }
  async function registerOperatorSource() {
    if (!detail) return;
    setBusy(true); setError("");
    try {
      await fetch(`${api}/${encodeURIComponent(detail.product.id)}/operator-source`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: operatorFilename, bytes: Number(operatorBytes), sha256: operatorSha256 }),
      }).then(errorText);
      setOperatorFilename(""); setOperatorBytes(""); setOperatorSha256("");
      await reload(); await reloadDetail(detail.product.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Operator source registration failed"); }
    finally { setBusy(false); }
  }
  async function upload() {
    if (!detail || !files?.length) return;
    setBusy(true); setError("");
    try {
      const body = new FormData();
      for (const file of Array.from(files)) body.append("files", file);
      await fetch(`${api}/${encodeURIComponent(detail.product.id)}/files`, { method: "POST", body }).then(errorText);
      setFiles(null); await reload(); await reloadDetail(detail.product.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setBusy(false); }
  }
  async function act(action: JewelryAction) {
    if (!detail) return;
    setBusy(true); setError("");
    try {
      await fetch(`${api}/${encodeURIComponent(detail.product.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      }).then(errorText);
      setReason(""); await reload(); await reloadDetail(detail.product.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(false); }
  }
  const product = detail?.product;
  const pack = detail?.pack;
  const trader = traders.find(item => item.id === product?.trader_id);
  const packReadyToPublish = pack?.visualApproval === "approved" && pack.publicationStatus === "published";
  const images = pack?.files.filter(path => /^(ecommerce|luxury)\/.+\.(png|jpg|jpeg|webp)$/i.test(path)) || [];
  const videos = pack?.mediaItems.filter(item => item.mediaType === "video") || [];
  const button = (label: string, action: JewelryAction, disabled = false) =>
    <button type="button" onClick={() => act(action)} disabled={busy || disabled}
      className="px-3 py-2 text-[11px] border border-white/20 rounded-md disabled:opacity-40 hover:bg-white/10">{label}</button>;

  return <div className="max-w-5xl mx-auto px-4 md:px-6 py-5 text-[#EAE8E4] space-y-5">
    <div><h1 className="text-lg font-light">Jewelry onboarding</h1>
      <p className="text-[11px] text-[#A6A6AB] mt-1">Existing approved traders · private source handoff · engine pack review</p></div>
    {error && <div role="alert" className="border border-red-500/50 bg-red-900/20 p-3 text-xs text-red-200">{error}</div>}

    <form onSubmit={create} className="border border-white/10 rounded-lg p-4 space-y-3">
      <h2 className="text-xs uppercase tracking-wider text-[#A6A6AB]">Add jewelry piece</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-[11px]">Approved trader
          <select required value={traderId} onChange={e => setTraderId(e.target.value)} className="field-input w-full mt-1">
            <option value="">Select trader</option>
            {traders.filter(item => item.status === "Active").map(item =>
              <option key={item.id} value={item.id}>{item.name}{item.company ? ` · ${item.company}` : ""}</option>)}
          </select></label>
        <label className="text-[11px]">Product name
          <input required value={name} onChange={e => setName(e.target.value)} className="field-input w-full mt-1" /></label>
        <label className="text-[11px]">Category from the product
          <input required value={category} onChange={e => setCategory(e.target.value)} placeholder="ring, earrings, pendant…" className="field-input w-full mt-1" /></label>
        <label className="text-[11px]">Existing engine assetId, if a pack already exists
          <input value={existingAssetId} onChange={e => setExistingAssetId(e.target.value)} placeholder="Otherwise generated automatically" className="field-input w-full mt-1" /></label>
        <label className="text-[11px]">Source method
          <select value={sourceMode} onChange={e => setSourceMode(e.target.value as typeof sourceMode)} className="field-input w-full mt-1">
            <option value="operator_handoff">Operator handoff</option><option value="cloud_source_upload">Cloud upload</option>
          </select></label>
      </div>
      <button disabled={busy || !traderId} className="px-4 py-2 text-xs bg-[#A6A6AB] text-[#101214] rounded-md disabled:opacity-40">Create product</button>
    </form>

    <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-4">
      <div className="border border-white/10 rounded-lg p-3 self-start">
        <h2 className="text-xs uppercase tracking-wider text-[#A6A6AB] mb-3">Pieces · {products.length}</h2>
        {products.length === 0 && <p className="text-xs text-[#A6A6AB]">No jewelry products yet.</p>}
        {products.map(item => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)}
          className="block text-left w-full px-2 py-2 border-b border-white/10"
          style={{ background: selectedId === item.id ? "#25292d" : "transparent" }}>
          <span className="block text-xs">{item.name}</span><span className="block text-[10px] text-[#A6A6AB]">{item.category} · {item.workflow_status}</span>
        </button>)}
      </div>
      <div className="border border-white/10 rounded-lg p-4 min-w-0">
        {!product ? <p className="text-xs text-[#A6A6AB]">Select a jewelry product to review its handoff and pack.</p> : <>
          <div className="flex flex-wrap justify-between gap-2">
            <div><h2 className="text-base font-light">{product.name}</h2><p className="text-xs text-[#A6A6AB]">{trader?.name || product.trader_id} · {product.category}</p></div>
            <span className="text-[11px] border border-white/20 rounded-full px-3 py-1 self-start">{product.workflow_status}</span>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 mt-4 text-[11px]">
            <div><dt className="text-[#A6A6AB]">Product ID</dt><dd className="break-all font-mono">{product.id}</dd></div>
            <div><dt className="text-[#A6A6AB]">Engine assetId</dt><dd className="break-all font-mono">{product.asset_id}</dd></div>
            <div><dt className="text-[#A6A6AB]">Revision</dt><dd className="font-mono">{product.revision_id || "Awaiting pack"}</dd></div>
            <div><dt className="text-[#A6A6AB]">Pack SHA-256</dt><dd className="break-all font-mono">{product.pack_hash || "Awaiting pack"}</dd></div>
            <div><dt className="text-[#A6A6AB]">Technical review</dt><dd>{product.technical_pass ? "Passed by staff" : pack?.technicalPass ? "Engine evidence ready · staff pending" : "Pending"}</dd></div>
            <div><dt className="text-[#A6A6AB]">Visual / publication</dt><dd>{product.visual_approval} / {product.publication_status}</dd></div>
          </dl>

          <section className="mt-5 border-t border-white/10 pt-4 space-y-2">
            <h3 className="text-xs uppercase tracking-wider text-[#A6A6AB]">Private source files</h3>
            {product.source_files.length === 0 && <p className="text-xs text-[#A6A6AB]">No source file received.</p>}
            {product.source_files.map(file => <div key={file.fileId || file.filename} className="text-[11px] break-all">{file.filename} · {file.kind} · {file.bytes.toLocaleString()} bytes · {file.fileId ? <a className="underline" href={`${api}/${product.id}/source/${file.fileId}`}>Download privately</a> : "Operator handoff"}<br/><span className="font-mono text-[#A6A6AB]">SHA-256 {file.sha256}</span></div>)}
            <a className="inline-block text-[11px] underline" href={`${api}/${product.id}/handoff`} target="_blank" rel="noreferrer">View engine handoff manifest</a>
            {["submitted", "revision_requested"].includes(product.workflow_status) && <>
              <input type="file" multiple accept=".obj,.glb,.fbx,.zip,.jpg,.jpeg,.png,.webp,.pdf"
                onChange={e => setFiles(e.target.files)} className="block text-[11px] w-full" />
              <button type="button" onClick={upload} disabled={busy || !files?.length}
                className="px-3 py-2 text-[11px] border border-white/20 rounded-md disabled:opacity-40">Upload source / optional evidence</button>
            </>}
            <p className="text-[10px] text-[#A6A6AB]">Source files stay in private Appwrite storage. Engine processing is an operator handoff; this dashboard does not run the engine.</p>
            {product.source_mode === "operator_handoff" && ["submitted", "revision_requested"].includes(product.workflow_status) && <div className="border border-white/10 rounded-md p-3 space-y-2">
              <p className="text-[10px] text-[#A6A6AB]">Register the local source identity; the raw file stays with the operator.</p>
              <input value={operatorFilename} onChange={e => setOperatorFilename(e.target.value)} placeholder="Filename, e.g. piece.obj" className="field-input w-full text-[11px]" />
              <input value={operatorBytes} onChange={e => setOperatorBytes(e.target.value)} placeholder="Byte count" inputMode="numeric" className="field-input w-full text-[11px]" />
              <input value={operatorSha256} onChange={e => setOperatorSha256(e.target.value)} placeholder="SHA-256" className="field-input w-full text-[11px] font-mono" />
              <button type="button" onClick={registerOperatorSource} disabled={busy || !operatorFilename || !operatorBytes || !operatorSha256} className="px-3 py-2 text-[11px] border border-white/20 rounded-md disabled:opacity-40">Register operator source</button>
            </div>}
          </section>

          <section className="mt-5 border-t border-white/10 pt-4">
            <h3 className="text-xs uppercase tracking-wider text-[#A6A6AB]">Engine handoff and review</h3>
            {detail.packError && <p className="mt-2 text-[11px] text-[#A6A6AB]">{detail.packError}</p>}
            {pack && <>
              <p className="mt-2 text-[11px]">Pack {pack.revisionId} · source hash {product.source_hashes.includes(pack.sourceSha256) ? "matches upload" : "does not match upload"} · engine technical evidence {pack.technicalPass ? "passes" : "pending"}</p>
              <p className="mt-1 text-[11px]">Geometry: {String(pack.geometry.meshCount ?? "unknown")} meshes · {String(pack.geometry.triangleCount ?? "unknown")} triangles · physical scale {pack.geometry.physicalScaleConfirmed === true ? "confirmed" : "unresolved"}</p>
              <p className="mt-1 text-[11px]">Gemstone qualification: {String((pack.materials.gemstoneSummary as Record<string, unknown> | undefined)?.qualified ?? "unknown")} qualified · material source {String((pack.materials.materials as Record<string, unknown> | undefined)?.source ?? "unresolved")}</p>
              <p className="mt-1 text-[11px]">Pack approval: {pack.visualApproval} / {pack.publicationStatus}</p>
              <div className="mt-3 h-72 bg-[#1A1D21] rounded-lg overflow-hidden">
                <ModelViewer src={preview(product.id, pack.chat.stageAsset)} poster={preview(product.id, pack.chat.poster)}
                  alt={product.name} autoRotate={false} cameraControls ar={false}
                  fallbackTitle={product.name} fallbackSubtitle="Browser GLB preview unavailable" style={{ width: "100%", height: "100%" }} />
              </div>
              <p className="mt-2 text-[11px] text-[#A6A6AB]">Chat stage · default view {pack.chat.defaultView} · rotation {pack.chat.rotationEnabled ? "enabled" : "disabled"} · actions {pack.chat.supportedViewerActions.join(", ")}</p>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {images.map(path => <figure key={path}><Image src={preview(product.id, path)} alt={path} width={320} height={320} unoptimized className="w-full aspect-square object-contain bg-[#1A1D21] rounded-md" /><figcaption className="text-[10px] text-[#A6A6AB] mt-1 break-all">{path}</figcaption></figure>)}
              </div>
              {videos.length > 0 && <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {videos.map(item => <figure key={item.id}><video controls preload="metadata" poster={preview(product.id, pack.chat.poster)} src={preview(product.id, item.path)} className="w-full aspect-square bg-[#1A1D21] rounded-md" /><figcaption className="text-[10px] text-[#A6A6AB]">{item.id} · {item.approvalState}</figcaption></figure>)}
              </div>}
              <div className="mt-4 flex items-center gap-3 text-[11px]">
                <Image src={preview(product.id, pack.boutique.thumbnail)} alt="" width={80} height={80} unoptimized className="w-20 h-20 object-contain bg-[#1A1D21] rounded-md" />
                <div>Boutique representation<br/><span className="text-[#A6A6AB]">{pack.boutique.name} · {pack.boutique.category}</span></div>
              </div>
              <div className="mt-4"><h4 className="text-xs">Unresolved limitations</h4>
                {pack.limitations.length ? <ul className="list-disc pl-5 text-[11px] text-[#A6A6AB] mt-1 space-y-1">{pack.limitations.map(item => <li key={item}>{item}</li>)}</ul> : <p className="text-[11px] text-[#A6A6AB]">None listed in this pack.</p>}
              </div>
            </>}
          </section>

          <section className="mt-5 border-t border-white/10 pt-4 space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-[#A6A6AB]">Review actions</h3>
            <div className="flex flex-wrap gap-2">
              {["submitted", "revision_requested"].includes(product.workflow_status) && button("Start processing", "start_processing", !product.source_files.some(file => file.kind === "source"))}
              {["submitted", "processing", "revision_requested"].includes(product.workflow_status) && button("Attach completed pack", "attach_pack", !pack)}
              {product.workflow_status === "technical_review" && button("Record Technical Pass", "technical_pass", !pack?.technicalPass)}
              {product.workflow_status === "visual_review" && button("Approve visuals", "approve")}
              {["technical_review", "visual_review", "approved"].includes(product.workflow_status) && button("Reject", "reject", !reason.trim())}
              {["technical_review", "visual_review", "approved", "rejected"].includes(product.workflow_status) && button("Request revision", "request_revision", !reason.trim())}
              {product.workflow_status === "approved" && button("Publish and sync", "publish", !packReadyToPublish)}
            </div>
            {["technical_review", "visual_review", "approved", "rejected"].includes(product.workflow_status) &&
              <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason required for rejection or revision" rows={2}
                className="field-input w-full text-[11px]" />}
            {product.workflow_status === "approved" && !packReadyToPublish &&
              <p className="text-[11px] text-[#A6A6AB]">Publication waits for an engine App Content Pack with visualApproval=approved and publicationStatus=published. The app will not alter engine contracts.</p>}
            {product.review_reason && <p className="text-[11px] text-[#A6A6AB]">Review note: {product.review_reason}</p>}
            {product.status_history.length > 0 && <div className="text-[10px] text-[#A6A6AB] space-y-1">
              {product.status_history.slice().reverse().map((event, index) =>
                <p key={index}>{event.at} · {event.status} · {event.action}{event.reason ? ` · ${event.reason}` : ""}</p>)}
            </div>}
          </section>
        </>}
      </div>
    </div>
  </div>;
}
