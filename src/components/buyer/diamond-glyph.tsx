/* ─── Diamond SVG glyph (platinum) ─── */
export function DiamondGlyph({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" style={{ width: size, height: size }} aria-hidden="true">
      <defs>
        <linearGradient id="buyer-pg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E8E6E1" />
          <stop offset="50%" stopColor="#C8C6C1" />
          <stop offset="100%" stopColor="#A6A6AB" />
        </linearGradient>
      </defs>
      <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="url(#buyer-pg)" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
