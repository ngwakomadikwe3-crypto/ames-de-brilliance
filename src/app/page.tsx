import { getAvailableStones, STONE_PLACEHOLDER } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const stones = await getAvailableStones();

  return (
    <div className="w-full">
      {/* Hero — pure SVG+CSS vitrine, charcoal background */}
      <style>{`
        @keyframes heroBreathe {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 0.85; }
          100% { transform: translate(-50%, -50%) scale(1.06); opacity: 1; }
        }
        .hero-glow {
          position: absolute; top: 50%; left: 50%;
          width: 240px; height: 240px; border-radius: 50%;
          background: radial-gradient(circle, rgba(201,162,39,0.22) 0%, rgba(201,162,39,0.06) 50%, transparent 70%);
          animation: heroBreathe 12s ease-in-out infinite alternate;
          pointer-events: none;
        }
        @keyframes heroSparkle {
          0%, 100% { opacity: 0; transform: scale(0.5) rotate(0deg); }
          50% { opacity: 1; transform: scale(1) rotate(180deg); }
        }
        .hero-sparkle-1 { animation: heroSparkle 3s ease-in-out infinite; animation-delay: 0s; }
        .hero-sparkle-2 { animation: heroSparkle 3s ease-in-out infinite; animation-delay: 1.5s; }
        @media (prefers-reduced-motion: reduce) {
          .hero-glow, .hero-sparkle-1, .hero-sparkle-2 { animation: none !important; }
          .hero-glow { opacity: 1; transform: translate(-50%, -50%); }
        }
      `}</style>
      <div className="relative w-full flex flex-col items-center justify-center py-16 md:py-24" style={{ background: '#0B0C0D', minHeight: 420 }}>
        {/* Vitrine card centered */}
        <div className="relative w-full max-w-[420px] mb-8" style={{ background: '#1A1A1A', borderRadius: 16, border: '1px solid #C9A227', overflow: 'hidden' }}>
          <div style={{ height: 280, position: 'relative', overflow: 'hidden' }}>
            {/* Radial gold glow */}
            <div className="hero-glow" />
            {/* Diamond glyph 140px centred */}
            <svg viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 140, height: 140 }} aria-hidden="true">
              <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#C9A227" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
            </svg>
            {/* Sparkle 1 — top-left */}
            <div className="hero-sparkle-1" style={{ position: 'absolute', top: 36, left: 42, pointerEvents: 'none' }}>
              <svg width="16" height="16" viewBox="0 0 14 14" fill="none"><path d="M7 0L8.2 5.2L14 7L8.2 8.8L7 14L5.8 8.8L0 7L5.8 5.2Z" fill="#C9A227" fillOpacity="0.9"/></svg>
            </div>
            {/* Sparkle 2 — top-right */}
            <div className="hero-sparkle-2" style={{ position: 'absolute', top: 52, right: 46, pointerEvents: 'none' }}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 0L8.2 5.2L14 7L8.2 8.8L7 14L5.8 8.8L0 7L5.8 5.2Z" fill="#C9A227" fillOpacity="0.7"/></svg>
            </div>
          </div>
        </div>
        {/* Wordmark below card */}
        <div className="flex flex-col items-center mb-6">
          <svg viewBox="0 0 24 24" fill="none" style={{ width: 44, height: 44 }} aria-hidden="true">
            <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#C9A227" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
          </svg>
          <span className="mt-3 text-[28px] md:text-[36px] font-semibold tracking-[-0.01em]" style={{ fontFamily: 'Georgia, "Times New Roman", serif', color: '#FAF8F4' }}>AMES</span>
          <span className="mt-1 text-[10px] md:text-[11px] font-normal uppercase tracking-[0.3em]" style={{ color: '#C9A227' }}>DE BRILLIANTE</span>
        </div>
        <p className="text-[13px] font-light leading-relaxed max-w-md text-center" style={{ color: '#9A938A' }}>
          Licensed Diamond Dealer, Republic of Botswana. Kimberley Process certified. Every stone carries the weight of a billion years beneath the Kalahari.
        </p>
      </div>

      {/* Stock section */}
      <div className="px-4 md:px-6 py-8 max-w-5xl mx-auto w-full">
      <p className="text-[11px] text-muted mb-4 leading-relaxed">
        Licensed under the Diamonds Act, Republic of Botswana · Kimberley Process Certification Scheme participant · Data Protection Act 2018 compliant.
      </p>
      <p className="text-[11px] mb-8 leading-relaxed" style={{ color: "#9A938A" }}>
        The seal marks stones from vetted, licensed partners with verified Kimberley Process documentation.
      </p>

      {stones.length === 0 ? (
        <p className="text-[12px] text-muted text-center py-12">No stones currently available.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {stones.map((stone) => {
            const isRough = stone.stone_type === "rough";
            const hasRealPhoto = stone.photo && !stone.photo.startsWith("data:") && stone.photo.length > 10;
            const displayPhoto = hasRealPhoto ? stone.photo : STONE_PLACEHOLDER;

            return (
              <div key={stone.id} className="overflow-hidden stone-glow" style={{ background: '#16181A', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="aspect-square overflow-hidden relative">
                  <img
                    src={displayPhoto}
                    alt={stone.ref}
                    className="w-full h-full object-cover"
                  />
                  {isRough && (
                    <span className="absolute top-2 left-2 bg-[#C9A227] text-[#0B0C0D] text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5">
                      Rough
                    </span>
                  )}
                  {stone.trader_preferred && (
                    <span className="absolute top-2 right-2 flex items-center gap-1 text-[9px] font-medium uppercase tracking-[0.08em] px-2 py-0.5 rounded-full" style={{ color: "#C9A227", background: "rgba(22,24,26,0.9)", border: "1px solid #C9A227" }}>
                      <svg viewBox="0 0 24 24" fill="none" className="w-2.5 h-2.5 shrink-0"><path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
                      Preferred Source
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-mono font-medium">{stone.ref}</span>
                    <span className="text-[11px] font-medium tabular-nums" style={{ color: stone.price ? "#C9A227" : "#9A938A" }}>
                      {isRough ? "Price on request" : (stone.price ? "$" + stone.price.toLocaleString() : "Price on request")}
                    </span>
                  </div>

                  {isRough ? (
                    <div className="text-[11px] text-muted leading-relaxed">
                      <div className="font-medium text-[#FAF8F4] mb-0.5">{stone.category} · {stone.crystal_form}</div>
                      <div>{stone.carat}ct · {stone.color}</div>
                      {stone.clarity_notes && <div className="mt-0.5 italic">{stone.clarity_notes}</div>}
                      {stone.kp_status === 1 && (
                        <div className="mt-1 text-[10px] font-semibold text-[#FAF8F4]">KP cert on file</div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted leading-relaxed">
                      {stone.shape} · {stone.carat}ct · {stone.color} · {stone.clarity}<br />
                      {stone.cut} · {stone.certification}
                    </div>
                  )}

                  <a
                    href={'https://wa.me/267?text=' + encodeURIComponent(
                      'Hello, I am interested in stone ' + stone.ref + ' (' +
                      (isRough
                        ? stone.category + ' ' + stone.carat + 'ct ' + stone.color
                        : stone.shape + ' ' + stone.carat + 'ct ' + stone.color + ' ' + stone.clarity + ' ' + stone.certification
                      ) + ').'
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full mt-2 py-1.5 bg-[#C9A227] text-[#0B0C0D] text-[11px] font-medium text-center rounded"
                  >
                    Enquire on WhatsApp
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-[12px] text-muted mt-8">
        {"Don't see what you need?"}{" "}
        <a href="/request" className="underline text-[#FAF8F4]">Submit a sourcing request</a>.
      </p>
    </div>
    </div>
  );
}
