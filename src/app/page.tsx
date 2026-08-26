import { getAvailableStones, STONE_PLACEHOLDER } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const stones = await getAvailableStones();

  return (
    <div className="w-full">
      {/* Hero */}
      <div className="w-full flex flex-col md:flex-row" style={{ background: '#FAF8F4' }}>
        <div className="flex-1 flex flex-col justify-center px-6 md:px-16 py-12 md:py-0 md:min-h-[420px]">
          <h1 className="text-[28px] md:text-[36px] font-light leading-tight mb-4" style={{ color: '#1A1A1A', fontFamily: 'Georgia, "Times New Roman", serif' }}>
            AMES DE BRILLIANTE
          </h1>
          <p className="text-[13px] font-light leading-relaxed max-w-md" style={{ color: '#666' }}>
            Licensed Diamond Dealer, Republic of Botswana. Kimberley Process certified. Every stone carries the weight of a billion years beneath the Kalahari.
          </p>
        </div>
        <div className="flex-1 md:min-h-[420px] overflow-hidden">
          <img src="/hero.png" alt="Diamonds" className="w-full h-full object-cover" style={{ minHeight: 240 }} />
        </div>
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
              <div key={stone.id} className="border border-border">
                <div className="aspect-square bg-surface overflow-hidden relative">
                  <img
                    src={displayPhoto}
                    alt={stone.ref}
                    className="w-full h-full object-cover"
                  />
                  {isRough && (
                    <span className="absolute top-2 left-2 bg-[#1A1A1A] text-[#FAF8F4] text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5">
                      Rough
                    </span>
                  )}
                  {stone.trader_preferred && (
                    <span className="absolute top-2 right-2 flex items-center gap-1 text-[9px] font-medium uppercase tracking-[0.08em] px-2 py-0.5 rounded-full" style={{ color: "#C9A227", background: "rgba(250,248,244,0.9)", border: "1px solid #C9A227" }}>
                      <svg viewBox="0 0 24 24" fill="none" className="w-2.5 h-2.5 shrink-0"><path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
                      Preferred Source
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-mono font-medium">{stone.ref}</span>
                    <span className="text-[11px] font-medium">
                      {isRough ? "Price on request" : (stone.price ? "$" + stone.price.toLocaleString() : "Price on request")}
                    </span>
                  </div>

                  {isRough ? (
                    <div className="text-[11px] text-muted leading-relaxed">
                      <div className="font-medium text-black mb-0.5">{stone.category} · {stone.crystal_form}</div>
                      <div>{stone.carat}ct · {stone.color}</div>
                      {stone.clarity_notes && <div className="mt-0.5 italic">{stone.clarity_notes}</div>}
                      {stone.kp_status === 1 && (
                        <div className="mt-1 text-[10px] font-semibold text-black">KP cert on file</div>
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
                    className="block w-full mt-2 py-1.5 bg-[#1A1A1A] text-[#FAF8F4] text-[11px] font-medium text-center"
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
        <a href="/request" className="underline text-black">Submit a sourcing request</a>.
      </p>
    </div>
    </div>
  );
}
