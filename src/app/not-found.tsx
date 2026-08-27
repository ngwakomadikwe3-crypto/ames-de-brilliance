import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#EAE8E4",
        padding: 24,
        textAlign: "center",
      }}
    >
      {/* Platinum diamond glyph */}
      <svg viewBox="0 0 24 24" fill="none" style={{ width: 44, height: 44, marginBottom: 28 }}>
        <defs>
          <linearGradient id="nf-g" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#E8E6E1" />
            <stop offset="50%" stopColor="#C8C6C1" />
            <stop offset="100%" stopColor="#A6A6AB" />
          </linearGradient>
        </defs>
        <path
          d="M12 2L22 9L12 22L2 9L12 2Z"
          stroke="url(#nf-g)"
          strokeWidth="1.8"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>

      <h1
        style={{
          fontSize: 22,
          fontWeight: 500,
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          color: "#171717",
          letterSpacing: "0.01em",
          marginBottom: 8,
        }}
      >
        This room does not exist.
      </h1>

      <p style={{ fontSize: 13, color: "#6E6C69", marginBottom: 32, fontWeight: 400 }}>
        The page you are looking for has moved or is not part of the house.
      </p>

      <Link
        href="/app"
        style={{
          fontSize: 13,
          color: "#171717",
          border: "1px solid rgba(23,23,23,0.08)",
          padding: "10px 24px",
          borderRadius: 14,
          textDecoration: "none",
          background: "#FCFCFB",
          fontWeight: 400,
          display: "inline-block",
        }}
      >
        Back to the house
      </Link>
    </div>
  );
}
