/* ─── Diamond SVG glyph (platinum) ─── */
export function DiamondGlyph({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" style={{ width: size, height: size }} aria-hidden="true">
      <defs>
        <linearGradient id="auction-pg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E8E6E1" />
          <stop offset="50%" stopColor="#C8C6C1" />
          <stop offset="100%" stopColor="#A6A6AB" />
        </linearGradient>
      </defs>
      <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="url(#auction-pg)" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/* ─── Lot Card Placeholder Art ───
   Engine lots carry no photos yet (stone_ref only), so this renders the
   glyph placeholder. It still accepts photos for the day lot imagery lands. */
export function LotArt({ title, photos = [] }: { title: string; photos?: string[] }) {
  const hasPhoto = photos.length > 0 && photos[0];
  if (hasPhoto) {
    return (
      <div className="w-full h-full" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photos[0]}
          alt={title}
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
