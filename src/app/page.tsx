"use client";

import { useState, useEffect, useCallback } from "react";

/* ─── Types (mirror of the /api/lots catalogue payload) ─── */
interface CatalogueLot {
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

/* ─── Helpers ─── */
/** Minor units → display amount. Assumes 2 decimal digits (USD, BWP, ZAR…). */
function formatPrice(minor: number, currency: string): string {
  return `${currency} ${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ─── Diamond SVG glyph (platinum) ─── */
function DiamondGlyph({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" style={{ width: size, height: size }} aria-hidden="true">
      <defs>
        <linearGradient id="catalogue-pg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E8E6E1" />
          <stop offset="50%" stopColor="#C8C6C1" />
          <stop offset="100%" stopColor="#A6A6AB" />
        </linearGradient>
      </defs>
      <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="url(#catalogue-pg)" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/* ─── Lot card art: first photo, or the glyph placeholder ─── */
function LotArt({ lot }: { lot: CatalogueLot }) {
  const [broken, setBroken] = useState(false);
  const src = lot.photos[0];
  if (src && !broken) {
    return (
      <div className="w-full h-full" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={lot.title}
          onError={() => setBroken(true)}
          style={{ width: "100%", height: "100%", objectFit: "contain", filter: "brightness(0.9) contrast(1.1)", mixBlendMode: "screen" }}
        />
      </div>
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center" style={{ background: "rgba(166,166,171,0.04)" }}>
      <DiamondGlyph size={48} />
    </div>
  );
}

/* ─── Access gate (unauthenticated / unverified / flag off) ─── */
function CatalogueGate({ message }: { message: string }) {
  return (
    <section className="max-w-5xl mx-auto px-4 md:px-6 py-20 md:py-28 text-center">
      <div className="flex justify-center mb-6">
        <DiamondGlyph size={36} />
      </div>
      <h2
        className="text-[24px] md:text-[32px] mb-4"
        style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif", fontWeight: 600, color: "#F5F5F2", letterSpacing: "-0.01em" }}
      >
        Licensed Buyer Access
      </h2>
      <p className="text-[13px] max-w-md mx-auto mb-8" style={{ color: "#A6A6AB", lineHeight: 1.7 }}>
        {message}
      </p>
      <div className="flex justify-center gap-3">
        <a
          href="/buyer"
          className="py-3 px-8 text-[13px] font-medium"
          style={{ background: "#F5F5F2", color: "#0E1013", borderRadius: 10, textDecoration: "none" }}
        >
          Register / Sign in
        </a>
        <a
          href="https://wa.me/26772839152?text=I%20would%20like%20to%20register%20as%20a%20licensed%20buyer%20for%20the%20AMES%20rough%20diamond%20catalogue."
          target="_blank"
          rel="noopener noreferrer"
          className="py-3 px-8 text-[13px]"
          style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "#A6A6AB", borderRadius: 10, textDecoration: "none" }}
        >
          Contact the desk
        </a>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   MAIN PAGE — rough diamond catalogue
   ═══════════════════════════════════════════ */
export default function Home() {
  const [lots, setLots] = useState<CatalogueLot[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/lots", { cache: "no-store" });
      if (res.status === 403) {
        setDenied(true);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLots(Array.isArray(data.lots) ? data.lots : []);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={{ background: "#0E1013", minHeight: "100vh", color: "#F5F5F2" }}>
      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden">
        <div
          style={{
            position: "absolute",
            top: "-40%",
            left: "50%",
            transform: "translateX(-50%)",
            width: 800,
            height: 600,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(166,166,171,0.06) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div className="max-w-5xl mx-auto px-4 md:px-6 pt-20 md:pt-28 pb-16 md:pb-20 text-center relative">
          <div className="flex justify-center mb-6">
            <DiamondGlyph size={36} />
          </div>
          <h1
            className="text-[32px] md:text-[48px] mb-4"
            style={{
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              color: "#F5F5F2",
            }}
          >
            The Botswana<br className="hidden md:block" /> Rough Diamond Catalogue
          </h1>
          <p
            className="text-[13px] md:text-[14px] max-w-lg mx-auto"
            style={{ color: "#A6A6AB", lineHeight: 1.7 }}
          >
            Rough parcels and single stones from Botswana&rsquo;s licensed trade —
            documented, compliant, and offered directly to verified buyers.
          </p>
        </div>
      </section>

      {/* ═══ CATALOGUE ═══ */}
      <section id="catalogue" className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16">
        {denied ? (
          <CatalogueGate message="The catalogue is reserved for licensed buyers. Register your account and complete licence verification to view lots and prices." />
        ) : failed ? (
          <p className="text-[12px] py-16 text-center" style={{ color: "#6E6C69" }}>
            The catalogue could not be loaded. Please try again shortly.
          </p>
        ) : lots === null ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="shimmer" style={{ height: 280, borderRadius: 14, background: "#14171A" }} />
            ))}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-8">
              <DiamondGlyph size={18} />
              <h2
                className="text-[22px] md:text-[26px]"
                style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif", fontWeight: 600, letterSpacing: "-0.01em" }}
              >
                Current lots
              </h2>
              <span className="text-[10px] uppercase tracking-[0.12em] ml-auto" style={{ color: "#6E6C69" }}>
                {lots.length} {lots.length === 1 ? "lot" : "lots"}
              </span>
            </div>

            {lots.length === 0 ? (
              <p className="text-[12px] py-12 text-center" style={{ color: "#6E6C69" }}>
                No lots are currently listed. New parcels are published as they complete compliance review —
                contact the desk to hear about upcoming listings.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {lots.map((lot) => (
                  <a
                    key={lot.id}
                    href={`/lots/${lot.id}`}
                    style={{
                      background: "#14171A",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 14,
                      overflow: "hidden",
                      textDecoration: "none",
                      display: "block",
                    }}
                  >
                    <div style={{ height: 180, position: "relative", overflow: "hidden" }}>
                      <LotArt lot={lot} />
                      <span
                        className="absolute top-3 left-3 text-[9px] font-medium uppercase tracking-[0.08em] px-2 py-0.5"
                        style={{ background: "rgba(245,245,242,0.12)", color: "#F5F5F2", borderRadius: 6 }}
                      >
                        Rough
                      </span>
                      {lot.hasModel && (
                        <span
                          className="absolute bottom-3 left-3 text-[9px] font-medium uppercase tracking-[0.08em] px-2 py-0.5"
                          style={{ background: "rgba(166,166,171,0.15)", color: "#A6A6AB", borderRadius: 6 }}
                        >
                          3D model
                        </span>
                      )}
                      <span
                        className="absolute top-3 right-3 text-[10px] tabular-nums"
                        style={{ color: "#6E6C69", background: "rgba(14,16,19,0.6)", padding: "2px 6px", borderRadius: 4 }}
                      >
                        Lot {lot.lotNo}
                      </span>
                    </div>

                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "#6E6C69" }}>
                          {lot.origin}
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.08)" }}>·</span>
                        <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "#6E6C69" }}>
                          {lot.stonesCount > 1 ? `${lot.stonesCount} stones` : "Single stone"}
                        </span>
                      </div>

                      <h3
                        className="text-[14px] mb-1"
                        style={{
                          fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
                          fontWeight: 600,
                          color: "#F5F5F2",
                          lineHeight: 1.3,
                        }}
                      >
                        {lot.title}
                      </h3>

                      <p className="text-[11px] mb-3" style={{ color: "#6E6C69" }}>
                        {lot.caratTotal} ct · {lot.colour} · {lot.clarity} · {lot.crystalForm}
                      </p>

                      <div className="flex items-end justify-between">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.1em] mb-0.5" style={{ color: "#6E6C69" }}>
                            Asking price
                          </div>
                          {lot.priceMinor !== undefined && lot.currency ? (
                            <div className="text-[18px] font-medium tabular-nums" style={{ color: "#F5F5F2" }}>
                              {formatPrice(lot.priceMinor, lot.currency)}
                            </div>
                          ) : (
                            <div className="text-[12px]" style={{ color: "#6E6C69" }}>
                              Verified buyers only
                            </div>
                          )}
                        </div>
                        <span className="text-[11px] font-medium" style={{ color: "#A6A6AB" }}>
                          View lot →
                        </span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section id="how-it-works" className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="flex items-center gap-3 mb-10">
          <DiamondGlyph size={18} />
          <h2
            className="text-[22px] md:text-[26px]"
            style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif", fontWeight: 600, letterSpacing: "-0.01em" }}
          >
            How it works
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {[
            { step: "01", title: "Registration", desc: "Create a buyer account and submit your diamond trading licence for verification." },
            { step: "02", title: "Verification", desc: "The house verifies your licence and identity. Verified buyers see the full catalogue and prices." },
            { step: "03", title: "The catalogue", desc: "Browse published rough lots — photography, specifications, and 3D models where available." },
            { step: "04", title: "Offers", desc: "Place a confidential offer on any listed lot. The house responds to every serious offer." },
            { step: "05", title: "Settlement", desc: "Pay by bank transfer. The lot ships with Kimberley Process certified documentation." },
          ].map((item, i) => (
            <div key={item.step} className="relative">
              {i < 4 && (
                <div
                  className="hidden md:block absolute top-5 left-full w-full h-px"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                />
              )}
              <div className="text-[10px] uppercase tracking-[0.14em] mb-2 tabular-nums" style={{ color: "#A6A6AB" }}>
                {item.step}
              </div>
              <h3
                className="text-[15px] mb-1.5"
                style={{
                  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
                  fontWeight: 600,
                  color: "#F5F5F2",
                }}
              >
                {item.title}
              </h3>
              <p className="text-[11px] leading-relaxed" style={{ color: "#6E6C69" }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ COMPLIANCE NOTE ═══ */}
      <section id="compliance" className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
        <div
          style={{
            background: "#14171A",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 14,
            padding: 24,
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <DiamondGlyph size={16} />
            <span className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "#A6A6AB" }}>
              Kimberley Process
            </span>
          </div>
          <p className="text-[12px] leading-relaxed" style={{ color: "#6E6C69" }}>
            All rough diamond transactions are conducted under the Kimberley Process Certification Scheme.
            AMES DE BRILLIANTE (Pty) Ltd is a licensed participant in the Botswana diamond trade, subject to
            the Diamonds Act, the Diamonds Trading Act, and the national customs regime. Every lot in this
            catalogue carries verified chain-of-custody documentation from mine to market.
          </p>
        </div>
      </section>

      {/* ═══ HOUSE SERVICES ═══ */}
      <section className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16">
        <h2
          className="text-[22px] md:text-[26px] mb-8 text-center"
          style={{
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
            fontWeight: 600,
            color: "#F5F5F2",
          }}
        >
          House Services
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { title: "Diamond Sourcing", desc: "We source rough stones directly from Botswana’s licensed mines and trading partners." },
            { title: "Private Viewings", desc: "Arrange an in-person or virtual viewing of any lot in the catalogue." },
            { title: "Valuation Support", desc: "Professional valuation and documentation for insurance, resale, or personal records." },
            { title: "Insured Delivery", desc: "Every shipment is insured in transit and coordinated through the desk." },
            { title: "Industry Document Reports", desc: "Upload a diamond, mining, trade, policy, or market document and receive a structured research report from the house." },
            { title: "Buyer Desk", desc: "A direct line to the house for registered buyers — questions on any lot, parcel breakdowns, or viewing requests." },
          ].map((s) => (
            <div
              key={s.title}
              style={{
                background: "#14171A",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 14,
                padding: 20,
              }}
            >
              <h3 className="text-[13px] font-medium mb-1.5" style={{ color: "#F5F5F2" }}>{s.title}</h3>
              <p className="text-[12px] leading-relaxed" style={{ color: "#6E6C69" }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ FOOTER CTA ═══ */}
      <section className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16 text-center">
        <DiamondGlyph size={28} />
        <h2
          className="text-[22px] md:text-[28px] mt-4 mb-2"
          style={{
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
            fontWeight: 600,
            color: "#F5F5F2",
          }}
        >
          Become a registered buyer
        </h2>
        <p className="text-[12px] mb-6" style={{ color: "#6E6C69" }}>
          Complete your buyer registration to access the full catalogue and prices.
        </p>
        <a
          href="/buyer"
          className="inline-block py-3 px-8 text-[13px] font-medium"
          style={{
            background: "#F5F5F2",
            color: "#0E1013",
            borderRadius: 10,
            textDecoration: "none",
          }}
        >
          Start registration
        </a>
      </section>
    </div>
  );
}
