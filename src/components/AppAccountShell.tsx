import Link from 'next/link';
import type { ReactNode } from 'react';
import HouseWordmark from './HouseWordmark';

export default function AppAccountShell({ title, children }: { title: string; children: ReactNode }) {
  return <div className="ames-app-shell ames-account-shell">
    <header className="ames-account-header"><Link href="/app" aria-label="HOUSEofAMES home"><HouseWordmark size={14} /></Link></header>
    <div className="ames-account-content">
      <Link href="/app" className="ames-account-back">← Back to HOUSEofAMES</Link>
      <h1>{title}</h1>
      {children}
      <nav className="ames-account-links" aria-label="House information"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/compliance">Compliance</Link></nav>
    </div>
  </div>;
}
