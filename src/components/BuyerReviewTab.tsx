"use client";

import { useCallback, useEffect, useState } from "react";

/* ─── Buyer Review Tab ───
   Staff/owner queue for buyer verification: pending first, document viewer
   via short-lived signed links (every view audited server-side), approve /
   reject / suspend with a required reason, data export, and anonymisation.
   Rendered only for owner/staff roles (see dashboard/page.tsx); the API
   re-checks the role on every call — the UI gate is convenience, not security. */

interface BuyerDocumentMeta {
  id: string;
  fileId: string;
  filename: string;
  contentType: string;
  size: number;
  sha256: string;
  uploadedAt: string;
}

interface ReviewBuyer {
  id: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  entityType: string;
  licenceNumber: string;
  licenceType: string;
  licenceExpiry: string;
  licenceVerifiedAt: string;
  licenceVerifiedBy: string;
  status: "pending" | "verified" | "rejected" | "suspended";
  statusReason: string;
  statusBy: string;
  statusAt: string;
  termsVersion: string;
  termsAcceptedAt: string;
  anonymisedAt: string;
  createdAt: string;
  documents: BuyerDocumentMeta[];
}

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  pending: { color: "#D8B25C", label: "Pending" },
  verified: { color: "#8FB996", label: "Verified" },
  rejected: { color: "#D08C7A", label: "Rejected" },
  suspended: { color: "#D08C7A", label: "Suspended" },
};

export default function BuyerReviewTab() {
  const [buyers, setBuyers] = useState<ReviewBuyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Decision panel: which buyer + which action is armed, and its reason.
  const [decision, setDecision] = useState<{ id: string; action: "approve" | "reject" | "suspend" } | null>(null);
  const [reason, setReason] = useState("");
  const [anonymiseId, setAnonymiseId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/staff/buyers", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBuyers(Array.isArray(data.buyers) ? data.buyers : []);
      setError(null);
    } catch {
      setError("Could not load the buyer queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/staff/buyers", { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setBuyers(Array.isArray(data.buyers) ? data.buyers : []);
        setError(null);
      } catch {
        if (!cancelled) setError("Could not load the buyer queue.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitDecision() {
    if (!decision || reason.trim().length < 3) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/buyers/${decision.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: decision.action, reason: reason.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNotice(`Decision recorded: ${decision.action}.`);
      setDecision(null);
      setReason("");
      await fetchQueue();
    } catch {
      setNotice("Decision failed — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function viewDocument(buyerId: string, docId: string) {
    try {
      const res = await fetch(`/api/staff/buyers/${buyerId}/documents/${docId}/link`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Programmatic anchor (no location assignment); the signed URL is
      // short-lived and the view is audited server-side.
      const a = document.createElement("a");
      a.href = data.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.click();
    } catch {
      setNotice("Could not open the document — the link may have expired.");
    }
  }

  function exportBuyer(buyerId: string) {
    const a = document.createElement("a");
    a.href = `/api/staff/buyers/${buyerId}/export`;
    a.download = `buyer-${buyerId}-export.json`;
    a.click();
    setNotice("Export downloaded — the export was written to the audit log.");
  }

  async function confirmAnonymise() {
    if (!anonymiseId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/buyers/${anonymiseId}/anonymise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNotice("Buyer anonymised — personal data erased, history kept under the pseudonymous id.");
      setAnonymiseId(null);
      await fetchQueue();
    } catch {
      setNotice("Anonymisation failed — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-6 text-[12px] text-muted">Loading buyer queue…</div>;
  if (error) return <div className="p-6 text-[12px] text-muted">{error}</div>;

  return (
    <div className="px-4 md:px-6 py-4 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-semibold">Buyer verification</h2>
        <button onClick={() => void fetchQueue()} className="text-[11px] text-muted hover:text-[#EAE8E4] cursor-default">Refresh</button>
      </div>
      {notice && <p className="text-[11px] mb-3 text-muted">{notice}</p>}
      {buyers.length === 0 && <p className="text-[12px] text-muted">No buyer applications yet.</p>}

      <div className="flex flex-col gap-2">
        {buyers.map((b) => {
          const st = STATUS_STYLE[b.status] ?? STATUS_STYLE.pending;
          const isOpen = expanded === b.id;
          return (
            <div key={b.id} className="rounded-lg border border-border" style={{ background: "#14171A" }}>
              <button
                className="w-full flex items-center justify-between px-3 py-2.5 text-left cursor-default"
                onClick={() => setExpanded(isOpen ? null : b.id)}
              >
                <div className="min-w-0">
                  <span className="text-[12px] font-medium">{b.name}</span>
                  <span className="text-[11px] text-muted ml-2">{b.email}</span>
                  <span className="text-[11px] text-muted ml-2">{b.entityType} · {b.country}</span>
                </div>
                <span className="text-[10px] font-semibold shrink-0 ml-3" style={{ color: st.color }}>
                  {st.label}{b.anonymisedAt ? " · erased" : ""}
                </span>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 pt-1 border-t border-border text-[12px]">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 mb-3">
                    <p><span className="text-muted">Phone:</span> {b.phone || "—"}</p>
                    <p><span className="text-muted">Licence no.:</span> {b.licenceNumber || "—"}</p>
                    <p><span className="text-muted">Licence type:</span> {b.licenceType || "—"}</p>
                    <p><span className="text-muted">Licence expiry:</span> {b.licenceExpiry || "—"}</p>
                    {b.licenceVerifiedAt && (
                      <p className="md:col-span-2">
                        <span className="text-muted">Licence verified:</span>{" "}
                        {new Date(b.licenceVerifiedAt).toLocaleString()} by {b.licenceVerifiedBy || "—"}
                      </p>
                    )}
                    <p><span className="text-muted">Applied:</span> {new Date(b.createdAt).toLocaleString()}</p>
                    <p><span className="text-muted">Terms accepted:</span> {b.termsVersion || "—"}</p>
                    {b.statusReason && <p className="md:col-span-2"><span className="text-muted">Last decision:</span> {b.statusReason} ({b.statusBy}, {b.statusAt ? new Date(b.statusAt).toLocaleString() : "—"})</p>}
                  </div>

                  <div className="mb-3">
                    <p className="text-[11px] font-semibold mb-1.5 text-muted">KYC documents ({b.documents.length})</p>
                    {b.documents.length === 0 && <p className="text-[11px] text-muted">None uploaded.</p>}
                    <div className="flex flex-col gap-1">
                      {b.documents.map((d) => (
                        <div key={d.id} className="flex items-center justify-between text-[11px]">
                          <span className="truncate mr-3">{d.filename} · {d.contentType} · {(d.size / 1024).toFixed(0)} KB</span>
                          <button
                            onClick={() => void viewDocument(b.id, d.id)}
                            className="shrink-0 underline text-muted hover:text-[#EAE8E4] cursor-default"
                          >
                            View (audited)
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {decision?.id === b.id ? (
                    <div className="rounded-md border border-border p-2.5 mb-2">
                      <p className="text-[11px] font-semibold mb-1.5">
                        Reason required — {decision.action === "approve" ? "approve" : decision.action === "reject" ? "reject" : "suspend"} {b.name}
                      </p>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={2}
                        maxLength={500}
                        placeholder="Why? This is shown to the buyer and written to the audit log."
                        className="w-full text-[12px] rounded-md px-2 py-1.5 mb-2"
                        style={{ background: "#0E1013", border: "1px solid rgba(255,255,255,0.1)", color: "#EAE8E4" }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => void submitDecision()}
                          disabled={reason.trim().length < 3 || busy}
                          className="px-3 py-1.5 text-[11px] font-semibold rounded-md cursor-default disabled:opacity-40"
                          style={{ background: "#EAE8E4", color: "#101214" }}
                        >
                          {busy ? "Saving…" : "Confirm decision"}
                        </button>
                        <button onClick={() => { setDecision(null); setReason(""); }} className="px-3 py-1.5 text-[11px] text-muted cursor-default">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {b.status !== "verified" && !b.anonymisedAt && (
                        <button onClick={() => setDecision({ id: b.id, action: "approve" })} className="px-3 py-1.5 text-[11px] rounded-md border border-border cursor-default" style={{ color: "#8FB996" }}>Approve</button>
                      )}
                      {b.status !== "rejected" && !b.anonymisedAt && (
                        <button onClick={() => setDecision({ id: b.id, action: "reject" })} className="px-3 py-1.5 text-[11px] rounded-md border border-border cursor-default" style={{ color: "#D08C7A" }}>Reject</button>
                      )}
                      {b.status !== "suspended" && !b.anonymisedAt && (
                        <button onClick={() => setDecision({ id: b.id, action: "suspend" })} className="px-3 py-1.5 text-[11px] rounded-md border border-border cursor-default" style={{ color: "#D08C7A" }}>Suspend</button>
                      )}
                      <button onClick={() => exportBuyer(b.id)} className="px-3 py-1.5 text-[11px] rounded-md border border-border text-muted cursor-default">Export data (audited)</button>
                      {!b.anonymisedAt && (
                        <button onClick={() => setAnonymiseId(b.id)} className="px-3 py-1.5 text-[11px] rounded-md border border-border text-muted cursor-default">Anonymise…</button>
                      )}
                    </div>
                  )}

                  {anonymiseId === b.id && (
                    <div className="rounded-md border p-2.5" style={{ borderColor: "#D08C7A" }}>
                      <p className="text-[11px] mb-2" style={{ color: "#D08C7A" }}>
                        Anonymising erases this buyer&rsquo;s personal data and deletes their uploaded documents.
                        Offers, deals and audit entries stay under the pseudonymous id — the history cannot be traced back to a person afterwards. This cannot be undone.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => void confirmAnonymise()}
                          disabled={busy}
                          className="px-3 py-1.5 text-[11px] font-semibold rounded-md cursor-default disabled:opacity-40"
                          style={{ background: "#D08C7A", color: "#101214" }}
                        >
                          {busy ? "Erasing…" : "Erase personal data"}
                        </button>
                        <button onClick={() => setAnonymiseId(null)} className="px-3 py-1.5 text-[11px] text-muted cursor-default">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
