"use client";

import { useState } from "react";
import { BrandMark } from "./BrandMark";
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
    <header className="border-b border-[rgba(23,23,23,0.08)] bg-[#FCFCFB] shrink-0 relative z-50">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 md:px-6 py-3">
        <a href="/" className="flex items-center shrink-0">
          <BrandMark variant="full" height={32} />
        </a>

        <nav className="hidden md:flex items-center gap-4 text-[11px] font-light">
          {NAV.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={isActive(link.href) ? "font-medium text-[#8E8E93] border-b border-[#8E8E93] pb-0.5" : "text-[#6E6C69] hover:text-[#171717]"}
            >
              {link.label}
            </a>
          ))}
          <a
            href="/dashboard"
            className={isActive("/dashboard") ? "font-medium text-[#8E8E93] border-b border-[#8E8E93] pb-0.5" : "text-[#6E6C69] hover:text-[#171717]"}
          >
            Dealer Login
          </a>
        </nav>

        <button onClick={() => setOpen(!open)} className="md:hidden p-2 -mr-2 cursor-default" aria-label="Toggle menu">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#171717" strokeWidth="1.5">
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
        <nav className="md:hidden border-t border-[rgba(23,23,23,0.08)] bg-[#FCFCFB] px-4 pb-3">
          {NAV.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={isActive(link.href)
                ? "block py-2.5 text-[13px] font-medium text-[#171717] border-b border-[rgba(23,23,23,0.08)]"
                : "block py-2.5 text-[13px] text-[#6E6C69] border-b border-[rgba(23,23,23,0.08)]"
              }
            >
              {link.label}
            </a>
          ))}
          <a
            href="/dashboard"
            className={isActive("/dashboard")
              ? "block py-2.5 text-[13px] font-medium text-[#171717]"
              : "block py-2.5 text-[13px] text-[#6E6C69]"
            }
          >
            Dealer Login
          </a>
        </nav>
      )}
    </header>
  );
}
