import React from "react";

type Props = {
  /** "full" = diamond + AMES + DE BRILLIANTE (header/nav), "compact" = diamond + AMES only (small spaces) */
  variant?: "full" | "compact";
  /** Override height in px (default: 36 full, 20 compact) */
  height?: number;
  /** Force dark text on dark backgrounds */
  dark?: boolean;
};

export function BrandMark({ variant = "full", height, dark = false }: Props) {
  const gold = "#C9A227";
  const text = dark ? "#FFFFFF" : "#1A1A1A";
  const sub = dark ? "rgba(255,255,255,0.6)" : "#9A938A";

  if (variant === "compact") {
    const h = height ?? 20;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: h * 0.3, lineHeight: 1 }}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          style={{ height: h, width: h, flexShrink: 0 }}
          aria-hidden="true"
        >
          <path
            d="M12 2L22 9L12 22L2 9L12 2Z"
            stroke={gold}
            strokeWidth="1.8"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
        <span
          style={{
            fontSize: Math.round(h * 0.6),
            fontWeight: 500,
            fontFamily: 'Georgia, "Times New Roman", serif',
            letterSpacing: "0.08em",
            color: text,
            lineHeight: 1,
          }}
        >
          AMES
        </span>
      </span>
    );
  }

  // Full variant
  const h = height ?? 36;
  const diamondSize = Math.round(h * 0.9);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: h * 0.22, lineHeight: 1 }}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        style={{ height: diamondSize, width: diamondSize, flexShrink: 0 }}
        aria-hidden="true"
      >
        <path
          d="M12 2L22 9L12 22L2 9L12 2Z"
          stroke={gold}
          strokeWidth="1.8"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      <span style={{ display: "flex", flexDirection: "column" }}>
        <span
          style={{
            fontSize: Math.round(h * 0.5),
            fontWeight: 500,
            fontFamily: 'Georgia, "Times New Roman", serif',
            letterSpacing: "0.08em",
            color: text,
            lineHeight: 1.1,
          }}
        >
          AMES
        </span>
        <span
          style={{
            fontSize: Math.round(h * 0.25),
            fontWeight: 400,
            fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            letterSpacing: "0.3em",
            color: gold,
            textTransform: "uppercase",
            lineHeight: 1.2,
          }}
        >
          DE BRILLIANTE
        </span>
      </span>
    </span>
  );
}
