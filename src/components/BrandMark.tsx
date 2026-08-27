import React from "react";

type Props = {
  variant?: "full" | "compact";
  height?: number;
  dark?: boolean;
};

export function BrandMark({ variant = "full", height, dark = true }: Props) {
  // Platinum silver-white gradient
  const text = "#171717";
  const sub = "#8E8E93";
  const silverGrad = true;

  if (variant === "compact") {
    const h = height ?? 20;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: h * 0.3, lineHeight: 1 }}>
        <svg viewBox="0 0 24 24" fill="none" style={{ height: h, width: h, flexShrink: 0 }} aria-hidden="true">
          <defs>
            <linearGradient id="bm-pg-c" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#E8E6E1" />
              <stop offset="50%" stopColor="#C8C6C1" />
              <stop offset="100%" stopColor="#A6A6AB" />
            </linearGradient>
          </defs>
          <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke={silverGrad ? "url(#bm-pg-c)" : sub} strokeWidth="1.8" strokeLinejoin="round" fill="none" />
        </svg>
        <span style={{ fontSize: Math.round(h * 0.6), fontWeight: 500, fontFamily: 'Georgia, "Times New Roman", serif', letterSpacing: "0.08em", color: text, lineHeight: 1 }}>
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
      <svg viewBox="0 0 24 24" fill="none" style={{ height: diamondSize, width: diamondSize, flexShrink: 0 }} aria-hidden="true">
        <defs>
          <linearGradient id="bm-pg-f" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#E8E6E1" />
            <stop offset="50%" stopColor="#C8C6C1" />
            <stop offset="100%" stopColor="#A6A6AB" />
          </linearGradient>
        </defs>
        <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke={silverGrad ? "url(#bm-pg-f)" : sub} strokeWidth="1.8" strokeLinejoin="round" fill="none" />
      </svg>
      <span style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: Math.round(h * 0.5), fontWeight: 500, fontFamily: 'Georgia, "Times New Roman", serif', letterSpacing: "0.08em", color: text, lineHeight: 1.1 }}>
          AMES
        </span>
        <span style={{ fontSize: Math.round(h * 0.25), fontWeight: 400, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", letterSpacing: "0.3em", color: sub, textTransform: "uppercase", lineHeight: 1.2 }}>
          DE BRILLIANTE
        </span>
      </span>
    </span>
  );
}
