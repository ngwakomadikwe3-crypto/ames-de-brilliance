import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AppAccountShell({ title, children }: { title: string; children: ReactNode }) {
  return <div className="ames-app-shell ames-account-shell">
    <header className="ames-account-header"><Link href="/app">AMES</Link><span>DE BRILLIANTE</span></header>
    <div className="ames-account-content">
      <Link href="/app" className="ames-account-back">← Back to AMES</Link>
      <h1>{title}</h1>
      {children}
      <nav className="ames-account-links" aria-label="House information"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/compliance">Compliance</Link></nav>
    </div>
  </div>;
}
