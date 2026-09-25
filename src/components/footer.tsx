"use client";

import { usePathname } from "next/navigation";

export default function Footer() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const bg = isHome ? "#0E1013" : "#EAE8E4";
  const text = isHome ? "#6E6C69" : "#6E6C69";
  const strong = isHome ? "#A6A6AB" : "#171717";
  const border = isHome ? "rgba(255,255,255,0.06)" : "rgba(23,23,23,0.08)";
  const linkHover = isHome ? "#F5F5F2" : "#171717";

  return (
    <footer
      className="shrink-0 px-4 md:px-6 py-6 text-[10px] leading-relaxed"
      style={{ background: bg, borderTop: `1px solid ${border}`, color: text }}
    >
      <div className="max-w-5xl mx-auto space-y-2">
        <div>
          <strong style={{ color: strong, fontWeight: 500 }}>AMES DE BRILLIANTE</strong>{" "}
          <span style={{ color: text }}>(Pty) Ltd — Licensed Diamond Dealer, Republic of Botswana</span>
        </div>
        <div>Kimberley Process Certification Scheme participant · Licence No. [pending]</div>
        <div>Plot [___], Gaborone, Botswana · WhatsApp: +267 72 839 152</div>
        <div className="flex gap-3 pt-1">
          <a href="/terms" className="underline" style={{ color: text }}>Terms of Use</a>
          <a href="/privacy" className="underline" style={{ color: text }}>Privacy</a>
          <a href="/compliance" className="underline" style={{ color: text }}>Compliance</a>
        </div>
        <div>All rough diamond exports conducted under the Kimberley Process Certification Scheme.</div>
        <div>© 2026 AMES DE BRILLIANTE (Pty) Ltd</div>
      </div>
    </footer>
  );
}
