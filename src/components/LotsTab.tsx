"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ─── Lots Tab ───
   Staff/owner lot management for the rough catalogue (STEP d1): create
   drafts, edit material fields (amendment 6 demotes approved/published lots
   back to pending_review), photo and GLB model uploads, compliance
   documents with audited signed views, and the state machine — submit is
   staff+owner, approve/reject/publish/withdraw are owner-only (the server
   re-checks; the UI gate is convenience).
   Rendered only for owner/staff roles (see dashboard/page.tsx). */

interface LotRow {
  id: string;
  lotNo: string;
  title: string;
  description: string;
  origin: string;
  caratTotal: number;
  stonesCount: number;
  colour: string;
  clarity: string;
  crystalForm: string;
  priceMinor: number;
  currency: string;
  sellerLicenceNumber: string;
  sellerLicenceType: string;
  sellerLicenceExpiry: string;
  state: "draft" | "pending_review" | "approved" | "published" | "withdrawn";
  stateReason: string;
  photoFileIds: string[];
  modelFileId: string;
  complianceCount?: number;
  updatedAt: string;
}

interface ComplianceDoc {
  id: string;
  docType: string;
  filename: string;
  contentType: string;
  size: number;
  notes: string;
  uploadedBy: string;
  uploadedAt: string;
}

const STATE_STYLE: Record<string, { color: string; label: string }> = {
  draft: { color: "#A6A6AB", label: "Draft" },
  pending_review: { color: "#D8B25C", label: "Pending review" },
  approved: { color: "#8FB996", label: "Approved" },
  published: { color: "#EAE8E4", label: "Published" },
  withdrawn: { color: "#D08C7A", label: "Withdrawn" },
};

const DOC_TYPES = [
  ["kp_certificate", "KP certificate"],
  ["origin_declaration", "Origin declaration"],
  ["valuation", "Valuation"],
  ["assay", "Assay report"],
  ["other", "Other"],
] as const;

const FIELD_LABELS: [string, string, string?][] = [
  ["lotNo", "Lot no.", "e.g. 2026-014"],
  ["title", "Title", "Jwaneng Select Parcel — 4.82 ct"],
  ["origin", "Origin", "Jwaneng"],
  ["colour", "Colour", "D–F"],
  ["clarity", "Clarity", "VVS1–VS2"],
  ["crystalForm", "Crystal form", "Octahedron"],
  ["sellerLicenceNumber", "Seller licence no.", ""],
  ["sellerLicenceType", "Seller licence type", ""],
  ["sellerLicenceExpiry", "Seller licence expiry (YYYY-MM-DD)", "2027-03-31"],
];

export default function LotsTab({ role }: { role: string }) {
  const [lots, setLots] = useState<LotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [docs, setDocs] = useState<ComplianceDoc[]>([]);
  const [docType, setDocType] = useState<string>("kp_certificate");
  const photoInput = useRef<HTMLInputElement>(null);
  const modelInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);

  const isOwner = role === "owner";

  const fetchLots = useCallback(async () => {
    try {
      const res = await fetch("/api/staff/lots", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLots(Array.isArray(data.lots) ? data.lots : []);
      setError(null);
    } catch {
      setError("Could not load lots.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchLots(); }, [fetchLots]);

  async function fetchDocs(lotId: string) {
    try {
      const res = await fetch(`/api/staff/lots/${lotId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDocs(Array.isArray(data.compliance) ? data.compliance : []);
    } catch {
      setDocs([]);
    }
  }

  function openLot(lot: LotRow) {
    if (expanded === lot.id) { setExpanded(null); return; }
    setExpanded(lot.id);
    setPendingAction(null);
    setReason("");
    setEditForm({
      lotNo: lot.lotNo, title: lot.title, description: lot.description, origin: lot.origin,
      caratTotal: String(lot.caratTotal || ""), stonesCount: String(lot.stonesCount || ""),
      colour: lot.colour, clarity: lot.clarity, crystalForm: lot.crystalForm,
      priceMinor: lot.priceMinor ? String(lot.priceMinor) : "", currency: lot.currency,
      sellerLicenceNumber: lot.sellerLicenceNumber, sellerLicenceType: lot.sellerLicenceType,
      sellerLicenceExpiry: lot.sellerLicenceExpiry,
    });
    void fetchDocs(lot.id);
  }

  async function createNewLot() {
    setBusy(true);
    try {
      const res = await fetch("/api/staff/lots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotNo: form.lotNo ?? "", title: form.title ?? "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setNotice(`Lot ${form.lotNo} created as a draft.`);
      setShowCreate(false);
      setForm({});
      await fetchLots();
    } catch (e) {
      setNotice(`Create failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(lot: LotRow) {
    setBusy(true);
    try {
      const patch: Record<string, unknown> = {};
      for (const [key, _label] of FIELD_LABELS) {
        if ((editForm[key] ?? "") !== String((lot as unknown as Record<string, unknown>)[key] ?? "")) {
          patch[key] = editForm[key] ?? "";
        }
      }
      if ((editForm.description ?? "") !== lot.description) patch.description = editForm.description;
      const num = (v: string) => (v.trim() === "" ? 0 : Number(v));
      if (num(editForm.caratTotal ?? "") !== lot.caratTotal) patch.caratTotal = num(editForm.caratTotal ?? "");
      if (num(editForm.stonesCount ?? "") !== lot.stonesCount) patch.stonesCount = Math.floor(num(editForm.stonesCount ?? ""));
      if (num(editForm.priceMinor ?? "") !== lot.priceMinor) patch.priceMinor = Math.round(num(editForm.priceMinor ?? ""));
      if (Object.keys(patch).length === 0) { setNotice("No changes."); return; }
      const res = await fetch(`/api/staff/lots/${lot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setNotice(
        data.lot?.state !== lot.state
          ? `Saved — the material change returned lot ${lot.lotNo} to pending review.`
          : "Saved.",
      );
      await fetchLots();
      if (expanded === lot.id) openLot({ ...lot, ...data.lot });
    } catch (e) {
      setNotice(`Save failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  }

  async function transition(lot: LotRow, action: string) {
    if ((action === "reject" || action === "withdraw") && pendingAction !== `${lot.id}:${action}`) {
      setPendingAction(`${lot.id}:${action}`);
      setReason("");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/lots/${lot.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const problems = data.detail?.problems ? ` — missing: ${data.detail.problems.join(", ")}` : "";
        throw new Error(`${data.error ?? `HTTP ${res.status}`}${problems}`);
      }
      setNotice(`Lot ${lot.lotNo}: ${action} recorded.`);
      setPendingAction(null);
      setReason("");
      await fetchLots();
      setExpanded(null);
    } catch (e) {
      setNotice(`${action} failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(lot: LotRow, file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/staff/lots/${lot.id}/photos`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setNotice("Photo added.");
      await fetchLots();
      setExpanded(null);
    } catch (e) {
      setNotice(`Photo upload failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto(lot: LotRow, fileId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/lots/${lot.id}/photos?fileId=${encodeURIComponent(fileId)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNotice("Photo removed.");
      await fetchLots();
      setExpanded(null);
    } catch (e) {
      setNotice(`Photo removal failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  }

  async function uploadModel(lot: LotRow, file: File) {
    setBusy(true);
    try {
      // Two-step: mint a short-lived upload ticket, then POST the GLB with it.
      const ticketRes = await fetch(`/api/staff/lots/${lot.id}/model-ticket`, { method: "POST" });
      const ticket = await ticketRes.json().catch(() => ({}));
      if (!ticketRes.ok) throw new Error(ticket.error ?? `HTTP ${ticketRes.status}`);
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `/api/staff/lots/${lot.id}/model?token=${encodeURIComponent(ticket.token)}&sig=${encodeURIComponent(ticket.sig)}`,
        { method: "POST", body: fd },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setNotice("3D model uploaded — the lot now offers a model view.");
      await fetchLots();
      setExpanded(null);
    } catch (e) {
      setNotice(`Model upload failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  }

  async function removeModel(lot: LotRow) {
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/lots/${lot.id}/model`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNotice("Model removed — the lot falls back to photography.");
      await fetchLots();
      setExpanded(null);
    } catch (e) {
      setNotice(`Model removal failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  }

  async function uploadDoc(lot: LotRow, file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("docType", docType);
      const res = await fetch(`/api/staff/lots/${lot.id}/compliance`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setNotice("Compliance document uploaded.");
      await fetchDocs(lot.id);
      await fetchLots();
    } catch (e) {
      setNotice(`Document upload failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  }

  async function viewDoc(lot: LotRow, docId: string) {
    try {
      const res = await fetch(`/api/staff/lots/${lot.id}/compliance/${docId}/link`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const a = document.createElement("a");
      a.href = data.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.click();
    } catch {
      setNotice("Could not open the document — the link may have expired.");
    }
  }

  async function removeDoc(lot: LotRow, docId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/lots/${lot.id}/compliance/${docId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNotice("Document removed.");
      await fetchDocs(lot.id);
      await fetchLots();
    } catch (e) {
      setNotice(`Document removal failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-6 text-[12px] text-muted">Loading lots…</div>;
  if (error) return <div className="p-6 text-[12px] text-muted">{error}</div>;

  return (
    <div className="px-4 md:px-6 py-4 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-semibold">Rough lots</h2>
        <div className="flex gap-3">
          <button onClick={() => void fetchLots()} className="text-[11px] text-muted hover:text-[#EAE8E4] cursor-default">Refresh</button>
          <button onClick={() => setShowCreate(!showCreate)} className="text-[11px] text-muted hover:text-[#EAE8E4] cursor-default">
            {showCreate ? "Cancel" : "New lot"}
          </button>
        </div>
      </div>
      {notice && <p className="text-[11px] mb-3 text-muted">{notice}</p>}

      {showCreate && (
        <div className="rounded-lg border border-border p-3 mb-3" style={{ background: "#14171A" }}>
          <p className="text-[11px] font-semibold mb-2">New draft lot</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
            <input className="field-input" placeholder="Lot no. (e.g. 2026-014)" value={form.lotNo ?? ""} onChange={(e) => setForm({ ...form, lotNo: e.target.value })} />
            <input className="field-input" placeholder="Title" value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <button
            onClick={() => void createNewLot()}
            disabled={busy || !(form.lotNo ?? "").trim() || !(form.title ?? "").trim()}
            className="px-3 py-1.5 text-[11px] font-semibold rounded-md cursor-default disabled:opacity-40"
            style={{ background: "#EAE8E4", color: "#101214" }}
          >
            {busy ? "Creating…" : "Create draft"}
          </button>
        </div>
      )}

      {lots.length === 0 && !showCreate && <p className="text-[12px] text-muted">No lots yet. Create the first draft.</p>}

      <div className="flex flex-col gap-2">
        {lots.map((lot) => {
          const st = STATE_STYLE[lot.state] ?? STATE_STYLE.draft;
          const isOpen = expanded === lot.id;
          return (
            <div key={lot.id} className="rounded-lg border border-border" style={{ background: "#14171A" }}>
              <button className="w-full flex items-center justify-between px-3 py-2.5 text-left cursor-default" onClick={() => openLot(lot)}>
                <div className="min-w-0">
                  <span className="text-[12px] font-medium">Lot {lot.lotNo}</span>
                  <span className="text-[11px] text-muted ml-2">{lot.title}</span>
                  <span className="text-[11px] text-muted ml-2">{lot.currency} {lot.priceMinor ? (lot.priceMinor / 100).toLocaleString("en-US") : "—"}</span>
                </div>
                <span className="text-[10px] font-semibold shrink-0 ml-3" style={{ color: st.color }}>{st.label}</span>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 pt-1 border-t border-border text-[12px]">
                  {/* Edit form */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                    {FIELD_LABELS.map(([key, label, ph]) => (
                      <label key={key} className="block">
                        <span className="text-[10px] text-muted">{label}</span>
                        <input className="field-input" placeholder={ph ?? ""} value={editForm[key] ?? ""} onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })} />
                      </label>
                    ))}
                    <label className="block">
                      <span className="text-[10px] text-muted">Weight (ct)</span>
                      <input className="field-input" inputMode="decimal" value={editForm.caratTotal ?? ""} onChange={(e) => setEditForm({ ...editForm, caratTotal: e.target.value })} />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-muted">Stones in parcel</span>
                      <input className="field-input" inputMode="numeric" value={editForm.stonesCount ?? ""} onChange={(e) => setEditForm({ ...editForm, stonesCount: e.target.value })} />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-muted">Price (minor units)</span>
                      <input className="field-input" inputMode="numeric" placeholder="e.g. 1250000 = 12,500.00" value={editForm.priceMinor ?? ""} onChange={(e) => setEditForm({ ...editForm, priceMinor: e.target.value })} />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-muted">Currency (ISO 4217)</span>
                      <input className="field-input" placeholder="USD / BWP / ZAR" maxLength={3} value={editForm.currency ?? ""} onChange={(e) => setEditForm({ ...editForm, currency: e.target.value.toUpperCase() })} />
                    </label>
                  </div>
                  <label className="block mb-2">
                    <span className="text-[10px] text-muted">Description</span>
                    <textarea className="field-input" rows={2} value={editForm.description ?? ""} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
                  </label>
                  {(lot.state === "approved" || lot.state === "published") && (
                    <p className="text-[10px] mb-2" style={{ color: "#D8B25C" }}>
                      Saving a material change returns this lot to pending review (house rule).
                    </p>
                  )}
                  <div className="flex gap-2 mb-3">
                    <button onClick={() => void saveEdit(lot)} disabled={busy} className="px-3 py-1.5 text-[11px] font-semibold rounded-md cursor-default disabled:opacity-40" style={{ background: "#EAE8E4", color: "#101214" }}>
                      {busy ? "Saving…" : "Save changes"}
                    </button>
                  </div>

                  {/* Photos */}
                  <div className="mb-3">
                    <p className="text-[11px] font-semibold mb-1.5 text-muted">Photography ({lot.photoFileIds.length})</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {lot.photoFileIds.map((fileId) => (
                        <div key={fileId} className="relative" style={{ width: 72, height: 64 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/lots/${lot.id}/photo/${fileId}`} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", background: "#0E1013", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }} />
                          <button onClick={() => void removePhoto(lot, fileId)} className="absolute -top-1 -right-1 text-[9px] px-1 rounded cursor-default" style={{ background: "#D08C7A", color: "#101214" }} aria-label="Remove photo">×</button>
                        </div>
                      ))}
                    </div>
                    <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPhoto(lot, f); e.target.value = ""; }} />
                    <button onClick={() => photoInput.current?.click()} disabled={busy} className="px-3 py-1.5 text-[11px] rounded-md border border-border text-muted cursor-default disabled:opacity-40">Add photo</button>
                  </div>

                  {/* 3D model */}
                  <div className="mb-3">
                    <p className="text-[11px] font-semibold mb-1.5 text-muted">3D model (single GLB, optional)</p>
                    {lot.modelFileId ? (
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-muted">Model attached ({lot.modelFileId.slice(0, 10)}…) — buyers view it through a signed 5-minute link.</span>
                        <button onClick={() => void removeModel(lot)} disabled={busy} className="underline text-muted hover:text-[#EAE8E4] cursor-default">Remove</button>
                      </div>
                    ) : (
                      <>
                        <input ref={modelInput} type="file" accept=".glb" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadModel(lot, f); e.target.value = ""; }} />
                        <button onClick={() => modelInput.current?.click()} disabled={busy} className="px-3 py-1.5 text-[11px] rounded-md border border-border text-muted cursor-default disabled:opacity-40">
                          Upload GLB
                        </button>
                      </>
                    )}
                  </div>

                  {/* Compliance documents */}
                  <div className="mb-3">
                    <p className="text-[11px] font-semibold mb-1.5 text-muted">Compliance documents ({docs.length})</p>
                    <div className="flex flex-col gap-1 mb-2">
                      {docs.map((d) => (
                        <div key={d.id} className="flex items-center justify-between text-[11px]">
                          <span className="truncate mr-3">
                            {DOC_TYPES.find(([v]) => v === d.docType)?.[1] ?? d.docType} · {d.filename} · {(d.size / 1024).toFixed(0)} KB
                          </span>
                          <span className="shrink-0 flex gap-3">
                            <button onClick={() => void viewDoc(lot, d.id)} className="underline text-muted hover:text-[#EAE8E4] cursor-default">View (audited)</button>
                            <button onClick={() => void removeDoc(lot, d.id)} className="underline text-muted hover:text-[#EAE8E4] cursor-default">Remove</button>
                          </span>
                        </div>
                      ))}
                      {docs.length === 0 && <p className="text-[11px] text-muted">None uploaded.</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <select value={docType} onChange={(e) => setDocType(e.target.value)} className="field-input" style={{ width: "auto" }}>
                        {DOC_TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                      </select>
                      <input ref={docInput} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadDoc(lot, f); e.target.value = ""; }} />
                      <button onClick={() => docInput.current?.click()} disabled={busy} className="px-3 py-1.5 text-[11px] rounded-md border border-border text-muted cursor-default disabled:opacity-40">Upload document</button>
                    </div>
                  </div>

                  {/* State machine */}
                  <div className="rounded-md border border-border p-2.5">
                    <p className="text-[11px] font-semibold mb-1.5">
                      State: <span style={{ color: st.color }}>{st.label}</span>
                      {lot.stateReason && <span className="text-muted font-normal"> — {lot.stateReason}</span>}
                    </p>
                    {pendingAction && (
                      <div className="mb-2">
                        <textarea
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          rows={2}
                          maxLength={500}
                          placeholder="Reason (required — written to the audit log)"
                          className="w-full text-[12px] rounded-md px-2 py-1.5 mb-2"
                          style={{ background: "#0E1013", border: "1px solid rgba(255,255,255,0.1)", color: "#EAE8E4" }}
                        />
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {lot.state === "draft" && (
                        <button onClick={() => void transition(lot, "submit")} disabled={busy} className="px-3 py-1.5 text-[11px] rounded-md border border-border cursor-default disabled:opacity-40" style={{ color: "#8FB996" }}>Submit for review</button>
                      )}
                      {isOwner && lot.state === "pending_review" && (
                        <button onClick={() => void transition(lot, "approve")} disabled={busy} className="px-3 py-1.5 text-[11px] rounded-md border border-border cursor-default disabled:opacity-40" style={{ color: "#8FB996" }}>Approve</button>
                      )}
                      {isOwner && lot.state === "pending_review" && (
                        pendingAction === `${lot.id}:reject`
                          ? <button onClick={() => void transition(lot, "reject")} disabled={busy || reason.trim().length < 3} className="px-3 py-1.5 text-[11px] font-semibold rounded-md cursor-default disabled:opacity-40" style={{ background: "#D08C7A", color: "#101214" }}>Confirm reject</button>
                          : <button onClick={() => void transition(lot, "reject")} disabled={busy} className="px-3 py-1.5 text-[11px] rounded-md border border-border cursor-default disabled:opacity-40" style={{ color: "#D08C7A" }}>Reject…</button>
                      )}
                      {isOwner && lot.state === "approved" && (
                        <button onClick={() => void transition(lot, "publish")} disabled={busy} className="px-3 py-1.5 text-[11px] font-semibold rounded-md cursor-default disabled:opacity-40" style={{ background: "#EAE8E4", color: "#101214" }}>Publish to catalogue</button>
                      )}
                      {isOwner && (lot.state === "approved" || lot.state === "published") && (
                        pendingAction === `${lot.id}:withdraw`
                          ? <button onClick={() => void transition(lot, "withdraw")} disabled={busy || reason.trim().length < 3} className="px-3 py-1.5 text-[11px] font-semibold rounded-md cursor-default disabled:opacity-40" style={{ background: "#D08C7A", color: "#101214" }}>Confirm withdraw</button>
                          : <button onClick={() => void transition(lot, "withdraw")} disabled={busy} className="px-3 py-1.5 text-[11px] rounded-md border border-border cursor-default disabled:opacity-40" style={{ color: "#D08C7A" }}>Withdraw…</button>
                      )}
                      {lot.state === "withdrawn" && (
                        <button onClick={() => void transition(lot, "reopen")} disabled={busy} className="px-3 py-1.5 text-[11px] rounded-md border border-border text-muted cursor-default disabled:opacity-40">Reopen as draft</button>
                      )}
                      {!isOwner && (lot.state === "pending_review" || lot.state === "approved" || lot.state === "published") && (
                        <span className="text-[10px] text-muted py-1.5">Approval and publishing are owner-only.</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
