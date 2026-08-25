import { getAvailableStones, STONE_PLACEHOLDER } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const stones = await getAvailableStones();

  return (
    <div className="px-4 md:px-6 py-8 max-w-5xl mx-auto w-full">
      <p className="text-[11px] text-muted mb-8 leading-relaxed">
        Licensed under the Diamonds Act, Republic of Botswana · Kimberley Process Certification Scheme participant · Data Protection Act 2018 compliant.
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
                    <span className="absolute top-2 left-2 bg-black text-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5">
                      Rough
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
                    className="block w-full mt-2 py-1.5 bg-black text-white text-[11px] font-medium text-center"
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
  );
}
