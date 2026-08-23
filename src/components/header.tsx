"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

const NAV = [
  { label: "Stock", href: "/" },
  { label: "Sourcing", href: "/request" },
  { label: "Reports", href: "/reports" },
  { label: "Compliance", href: "/compliance" },
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
];

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <header className="border-b border-border bg-white shrink-0 relative z-50">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 md:px-6 py-3">
        {/* Left: diamond + wordmark */}
        <a href="/" className="flex items-center gap-2 shrink-0">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" aria-hidden="true">
            <path d="M12 2L22 9L12 22L2 9L12 2Z" stroke="#000000" strokeWidth="1.5" fill="none" />
          </svg>
          <span className="text-sm font-bold tracking-tight">AMES DE BRILLIANCE</span>
        </a>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-4 text-[11px]">
          {NAV.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={isActive(link.href) ? "font-semibold text-black border-b border-black pb-0.5" : "text-muted hover:text-black"}
            >
              {link.label}
            </a>
          ))}
          <a
            href="/dashboard"
            className={isActive("/dashboard") ? "font-semibold text-black border-b border-black pb-0.5" : "text-muted hover:text-black"}
          >
            Dealer Login
          </a>
        </nav>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(!open)}
          className="md:hidden p-2 -mr-2 cursor-default"
          aria-label="Toggle menu"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#000" strokeWidth="1.5">
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

      {/* Mobile menu */}
      {open && (
        <nav className="md:hidden border-t border-border bg-white px-4 pb-3">
          {NAV.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={isActive(link.href)
                ? "block py-2.5 text-[13px] font-semibold text-black border-b border-border"
                : "block py-2.5 text-[13px] text-muted border-b border-border"
              }
            >
              {link.label}
            </a>
          ))}
          <a
            href="/dashboard"
            className={isActive("/dashboard")
              ? "block py-2.5 text-[13px] font-semibold text-black"
              : "block py-2.5 text-[13px] text-muted"
            }
          >
            Dealer Login
          </a>
        </nav>
      )}
    </header>
  );
}
