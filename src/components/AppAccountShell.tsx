'use client';
import {useSilk} from './SilkPreference';
import Link from 'next/link';
import type { ReactNode } from 'react';
import HouseWordmark from './HouseWordmark';

export default function AppAccountShell({ title, children }: { title: string; children: ReactNode }) {
  const silk=useSilk();
  return <div data-silk={silk.toLowerCase()} className="ames-app-shell ames-account-shell">
    <header className="ames-account-header"><Link href="/app" aria-label="HOUSEofAMES home"><HouseWordmark size={14} tone={silk==="White"?"ink":"light"} /></Link></header>
    <div className="ames-account-content">
      <Link href="/app" className="ames-account-back">← Back to HOUSEofAMES</Link>
      <h1>{title}</h1>
      {children}
      <nav className="ames-account-links" aria-label="House information"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/compliance">Compliance</Link></nav>
    </div>
  </div>;
}
