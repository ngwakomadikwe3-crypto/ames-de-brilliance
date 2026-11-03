"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import ModelViewer from "@/components/ModelViewer";

/* ─── Types (mirror of the /api/lots/[id] payload) ─── */
interface LotDetail {
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
  photos: string[];
  hasModel: boolean;
  publishedAt: string;
  priceMinor?: number;
  currency?: string;
}

const CORMORANT = "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif";

/** Minor units → display amount. Assumes 2 decimal digits (USD, BWP, ZAR…). */
function formatPrice(minor: number, currency: string): string {
  return `${currency} ${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function DiamondGlyph({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" style={{ width: size, height: size }} aria-hidden="true">
      <defs>
        <linearGradient id="lot-pg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E8E6E1" />
          <stop offset="50%" stopColor="#C8C6C1" />
          <stop offset="100%" stopColor="#A6A6AB" />
        </linearGradient>
      </defs>
      <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="url(#lot-pg)" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/**
 * Lot detail (STEP d1): photography is the primary display — the page is
 * photos-first and fully useful without a model (photos-only fallback). When
 * the lot has a GLB, a signed short-lived URL is minted on demand and the
 * shared ModelViewer renders it; verified buyers only by default.
 */
export default function LotPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [lot, setLot] = useState<LotDetail | null>(null);
  const [modelAccess, setModelAccess] = useState<string>("verified");
  const [status, setStatus] = useState<"loading" | "ready" | "denied" | "missing" | "error">("loading");
  const [photoIndex, setPhotoIndex] = useState(0);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [modelBusy, setModelBusy] = useState(false);
  const [modelDenied, setModelDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/lots/${id}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 403) { setStatus("denied"); return; }
        if (res.status === 404) { setStatus("missing"); return; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setLot(data.lot ?? null);
        setModelAccess(typeof data.modelAccess === "string" ? data.modelAccess : "verified");
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const loadModel = useCallback(async () => {
    setModelBusy(true);
    setModelDenied(false);
    try {
      const res = await fetch(`/api/lots/${id}/model`, { method: "POST", cache: "no-store" });
      if (res.status === 403) { setModelDenied(true); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.url) setModelUrl(data.url as string);
    } catch {
      setModelDenied(true);
    } finally {
      setModelBusy(false);
    }
  }, [id]);

  return (
    <div style={{ background: "#0E1013", minHeight: "100vh", color: "#F5F5F2" }}>
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-10 md:py-16">
        <a href="/#catalogue" className="text-[11px]" style={{ color: "#6E6C69", textDecoration: "none" }}>
          ← Back to the catalogue
        </a>

        {status === "loading" && (
          <div className="shimmer mt-6" style={{ height: 360, borderRadius: 14, background: "#14171A" }} />
        )}

        {status === "denied" && (
          <div className="text-center py-24">
            <div className="flex justify-center mb-6"><DiamondGlyph size={32} /></div>
            <h1 className="text-[24px] mb-3" style={{ fontFamily: CORMORANT, fontWeight: 600 }}>Licensed Buyer Access</h1>
            <p className="text-[13px] max-w-md mx-auto mb-8" style={{ color: "#A6A6AB", lineHeight: 1.7 }}>
              This lot is reserved for licensed buyers. Sign in with a verified buyer account to view it.
            </p>
            <a href="/buyer" className="py-3 px-8 text-[13px] font-medium" style={{ background: "#F5F5F2", color: "#0E1013", borderRadius: 10, textDecoration: "none" }}>
              Register / Sign in
            </a>
          </div>
        )}

        {(status === "missing" || status === "error") && (
          <div className="text-center py-24">
            <div className="flex justify-center mb-6"><DiamondGlyph size={32} /></div>
            <h1 className="text-[24px] mb-3" style={{ fontFamily: CORMORANT, fontWeight: 600 }}>
              {status === "missing" ? "Lot not listed" : "Something went wrong"}
            </h1>
            <p className="text-[13px] max-w-md mx-auto" style={{ color: "#6E6C69", lineHeight: 1.7 }}>
              {status === "missing"
                ? "This lot is not currently listed. It may have been withdrawn or sold."
                : "The lot could not be loaded. Please try again shortly."}
            </p>
          </div>
        )}

        {status === "ready" && lot && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
            {/* ── Visual: photos first, optional 3D model ── */}
            <div>
              <div
                style={{
                  background: "#14171A",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 14,
                  overflow: "hidden",
                  height: 380,
                  position: "relative",
                }}
              >
                {modelUrl ? (
                  <ModelViewer
                    src={modelUrl}
                    poster={lot.photos[photoIndex] ?? lot.photos[0]}
                    alt={`3D model of lot ${lot.lotNo}`}
                    style={{ width: "100%", height: "100%" }}
                    fallbackTitle={lot.title}
                    fallbackSubtitle="Model unavailable — photography above"
                  />
                ) : lot.photos.length > 0 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={lot.photos[photoIndex] ?? lot.photos[0]}
                    alt={lot.title}
                    style={{ width: "100%", height: "100%", objectFit: "contain", padding: 16, filter: "brightness(0.9) contrast(1.1)", mixBlendMode: "screen" }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ background: "rgba(166,166,171,0.04)" }}>
                    <DiamondGlyph size={64} />
                  </div>
                )}
              </div>

              {lot.photos.length > 1 && (
                <div className="flex gap-2 mt-3 overflow-x-auto">
                  {lot.photos.map((src, i) => (
                    <button
                      key={src}
                      onClick={() => { setPhotoIndex(i); setModelUrl(null); }}
                      className="shrink-0 cursor-pointer"
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 10,
                        overflow: "hidden",
                        border: i === photoIndex && !modelUrl ? "1px solid #A6A6AB" : "1px solid rgba(255,255,255,0.08)",
                        background: "#14171A",
                        padding: 0,
                      }}
                      aria-label={`Photo ${i + 1}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    </button>
                  ))}
                </div>
              )}

              {lot.hasModel && !modelUrl && (
                <button
                  onClick={() => void loadModel()}
                  disabled={modelBusy}
                  className="w-full mt-3 py-2.5 text-[12px] font-medium"
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "#EAE8E4",
                    borderRadius: 10,
                    cursor: modelBusy ? "wait" : "pointer",
                  }}
                >
                  {modelBusy ? "Preparing 3D model…" : "View 3D model"}
                </button>
              )}
              {lot.hasModel && modelUrl && (
                <p className="text-[10px] mt-2 text-center" style={{ color: "#6E6C69" }}>
                  Drag to rotate · the model link expires after five minutes
                </p>
              )}
              {modelDenied && (
                <p className="text-[11px] mt-2" style={{ color: "#A6A6AB" }}>
                  {modelAccess === "verified"
                    ? "The 3D model is reserved for verified buyers. The photography above shows the lot in full."
                    : "The model could not be loaded — the photography above shows the lot in full."}
                </p>
              )}
            </div>

            {/* ── Facts ── */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "#6E6C69" }}>Lot {lot.lotNo}</span>
                <span style={{ color: "rgba(255,255,255,0.08)" }}>·</span>
                <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "#6E6C69" }}>Rough</span>
                <span style={{ color: "rgba(255,255,255,0.08)" }}>·</span>
                <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "#6E6C69" }}>{lot.origin}</span>
              </div>
              <h1 className="text-[26px] md:text-[32px] mb-4" style={{ fontFamily: CORMORANT, fontWeight: 600, lineHeight: 1.15 }}>
                {lot.title}
              </h1>

              <div
                className="grid grid-cols-2 gap-x-6 gap-y-3 mb-6 text-[12px]"
                style={{ background: "#14171A", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 }}
              >
                {[
                  ["Total weight", `${lot.caratTotal} ct`],
                  ["Contents", lot.stonesCount > 1 ? `${lot.stonesCount} stones` : "Single stone"],
                  ["Colour", lot.colour],
                  ["Clarity", lot.clarity],
                  ["Crystal form", lot.crystalForm],
                  ["Origin", lot.origin],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="text-[10px] uppercase tracking-[0.1em] mb-0.5" style={{ color: "#6E6C69" }}>{label}</div>
                    <div style={{ color: "#F5F5F2" }}>{value}</div>
                  </div>
                ))}
              </div>

              {lot.description && (
                <p className="text-[12px] leading-relaxed mb-6" style={{ color: "#A6A6AB" }}>
                  {lot.description}
                </p>
              )}

              <div className="mb-6">
                <div className="text-[10px] uppercase tracking-[0.1em] mb-1" style={{ color: "#6E6C69" }}>Asking price</div>
                {lot.priceMinor !== undefined && lot.currency ? (
                  <div className="text-[26px] font-medium tabular-nums" style={{ color: "#F5F5F2", fontFamily: CORMORANT }}>
                    {formatPrice(lot.priceMinor, lot.currency)}
                  </div>
                ) : (
                  <div className="text-[13px]" style={{ color: "#6E6C69" }}>
                    Prices are visible to verified buyers.
                  </div>
                )}
              </div>

              <a
                href={`https://wa.me/26772839152?text=${encodeURIComponent(`Enquiry about lot ${lot.lotNo} — ${lot.title}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center py-3 text-[13px] font-medium"
                style={{ background: "#F5F5F2", color: "#0E1013", borderRadius: 10, textDecoration: "none" }}
              >
                Enquire about this lot
              </a>
              <p className="text-[10px] mt-4 leading-relaxed" style={{ color: "#6E6C69" }}>
                Sold under the Kimberley Process Certification Scheme with verified chain-of-custody
                documentation. Compliance documents are held by the house and available to the buyer at settlement.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
