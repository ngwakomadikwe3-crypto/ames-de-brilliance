"use client";

import { useEffect, useState } from 'react';
import { loadBoutiqueContent, type BoutiquePiece } from '../lib/ames-boutique-content';

export default function EngineAuctionPanel({ onViewPiece, onAskSame }: {
  onViewPiece: (assetId: string) => void;
  onAskSame: (piece: BoutiquePiece) => void;
}) {
  const [pieces, setPieces] = useState<BoutiquePiece[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    loadBoutiqueContent().then(items => {
      if (active) { setPieces(items); setState('ready'); }
    }).catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, []);

  return (
    <div data-auction-panel className="h-full overflow-y-auto overscroll-contain text-[#eef5f2]" style={{ fontFamily: 'var(--font-geist), Arial, sans-serif' }}>
      <div className="mx-auto max-w-6xl px-6 pb-16 pt-24 sm:px-12 sm:pt-28">
        <header className="border-b border-white/15 pb-9 sm:pb-12">
          <p className="text-[10px] uppercase tracking-[0.24em] text-[#b8d0c8]">AMES · Auction</p>
          <div className="mt-5 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <h1 className="text-[40px] font-normal leading-[1.08] tracking-[-0.04em] sm:text-6xl">The Auction Room</h1>
              <p className="mt-5 max-w-md text-sm leading-6 text-[#b8d0c8]">A space to discover each piece, consider the details, and explore the collection.</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-emerald-950/25 px-5 py-4 md:max-w-xs">
              <p className="flex items-center gap-2 text-sm" data-auction-status><span className="h-1.5 w-1.5 rounded-full bg-[#b8d0c8]" aria-hidden="true" />No auction scheduled</p>
              <p className="mt-2 text-xs leading-5 text-[#b8d0c8]">Bidding and payments are not available.</p>
            </div>
          </div>
        </header>

        <section aria-labelledby="auction-catalogue-title" className="pt-8 sm:pt-10">
          <div className="mb-6 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <h2 id="auction-catalogue-title" className="text-xl font-normal tracking-tight">Catalogue preview</h2>
            <p className="text-xs leading-5 text-[#b8d0c8]">Existing AMES pieces · Not scheduled auction lots</p>
          </div>
          {state === 'loading' && <p role="status" className="py-12 text-sm text-[#b8d0c8]">Loading the catalogue…</p>}
          {state === 'error' && <p role="status" className="py-12 text-sm text-[#b8d0c8]">The catalogue is unavailable. Please try again later.</p>}
          {state === 'ready' && pieces.length === 0 && <p role="status" className="py-12 text-sm text-[#b8d0c8]">No pieces are available to preview.</p>}
          <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-4">
            {pieces.map(piece => (
              <article key={piece.assetId} data-auction-asset={piece.assetId} data-auction-revision={piece.revisionId}
                className="overflow-hidden rounded-2xl border border-white/15 bg-emerald-950/20">
                <button type="button" onClick={() => onViewPiece(piece.assetId)} aria-label={`View ${piece.name} in Boutique`}
                  className="block aspect-square w-full p-7 transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-white/80">
                  <img src={piece.poster} alt={piece.name} loading="lazy" className="h-full w-full object-contain" />
                </button>
                <div className="border-t border-white/10 px-5 pb-5 pt-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#b8d0c8]">{piece.category}</p>
                  <h3 className="mt-2 text-lg font-normal leading-snug">{piece.name}</h3>
                  {(piece.publicationStatus !== 'published' || piece.visualApproval !== 'approved') && <p className="mt-2 text-[11px] text-[#b8d0c8]">Preview · visual approval pending</p>}
                  <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs">
                    <button type="button" onClick={() => onViewPiece(piece.assetId)} className="border-b border-white/50 pb-1 hover:border-white">View piece</button>
                    <button type="button" onClick={() => onAskSame(piece)} className="border-b border-white/25 pb-1 text-[#b8d0c8] hover:border-white">Ask SAME</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
