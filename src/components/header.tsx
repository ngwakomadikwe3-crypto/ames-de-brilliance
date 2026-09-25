"use client";

import { useState } from "react";
import { BrandMark } from "./BrandMark";
import { usePathname } from "next/navigation";

const NAV = [
  { label: "Catalogue", href: "/#catalogue" },
  { label: "Results", href: "/#results" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Compliance", href: "/compliance" },
];

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isHome = pathname === "/";

  function isActive(href: string) {
    if (href.startsWith("/#")) return false;
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <header
      className="shrink-0 relative z-50"
      style={{
        background: isHome ? "rgba(14,16,19,0.85)" : "#FCFCFB",
        backdropFilter: isHome ? "blur(16px)" : undefined,
        WebkitBackdropFilter: isHome ? "blur(16px)" : undefined,
        borderBottom: isHome ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(23,23,23,0.08)",
      }}
    >
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 md:px-6 py-3">
        <a href="/" className="flex items-center shrink-0">
          <BrandMark variant="full" height={32} dark={isHome} />
        </a>

        <nav className="hidden md:flex items-center gap-4 text-[11px] font-light">
          {NAV.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={
                isActive(link.href)
                  ? "font-medium pb-0.5"
                  : "hover:opacity-80"
              }
              style={{
                color: isHome ? "#A6A6AB" : isActive(link.href) ? "#8E8E93" : "#6E6C69",
                borderBottom: isActive(link.href) ? `1px solid ${isHome ? "#A6A6AB" : "#8E8E93"}` : undefined,
              }}
            >
              {link.label}
            </a>
          ))}
          <a
            href="/login"
            className="font-medium pb-0.5"
            style={{ color: isHome ? "#A6A6AB" : "#8E8E93" }}
          >
            Register to bid
          </a>
        </nav>

        <button onClick={() => setOpen(!open)} className="md:hidden p-2 -mr-2 cursor-default" aria-label="Toggle menu">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={isHome ? "#A6A6AB" : "#171717"} strokeWidth="1.5">
            {open ? (
              <>
                <line x1="4" y1="4" x2="16" y2="16" />
                <line x1="16" y1="4" x2="4" y2="16" />
              </>
            ) : (
              <>
                <line x1="3" y1="5" x2="17" y2="5" />
                <line x1="3" y1="10" x2="17" y2="10" />
                <line x1="3" y1="15" x2="17" y2="15" />
              </>
            )}
          </svg>
        </button>
      </div>

      {open && (
        <nav
          className="md:hidden px-4 pb-3"
          style={{
            background: isHome ? "rgba(14,16,19,0.95)" : "#FCFCFB",
            borderTop: isHome ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(23,23,23,0.08)",
          }}
        >
          {NAV.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="block py-2.5 text-[13px] border-b"
              style={{
                color: isHome ? "#A6A6AB" : "#6E6C69",
                borderColor: isHome ? "rgba(255,255,255,0.06)" : "rgba(23,23,23,0.08)",
              }}
            >
              {link.label}
            </a>
          ))}
          <a
            href="/login"
            className="block py-2.5 text-[13px]"
            style={{ color: isHome ? "#A6A6AB" : "#6E6C69" }}
          >
            Register to bid
          </a>
        </nav>
      )}
    </header>
  );
}
