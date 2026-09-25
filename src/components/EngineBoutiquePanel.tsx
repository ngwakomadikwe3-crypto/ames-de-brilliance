"use client";

import { useEffect, useRef, useState } from 'react';
import ModelViewer from './ModelViewer';
import EngineJewelryViewer from './EngineJewelryViewer';
import { boutiqueCategories, boutiqueByCategory, boutiqueGroups, boutiquePrice, loadBoutiqueContent, type BoutiqueCategory, type BoutiquePiece } from '../lib/ames-boutique-content';

function PieceTile({ piece, single, onOpen }: { piece: BoutiquePiece; single: boolean; onOpen: () => void }) {
  const price = boutiquePrice(piece.price);
  const review = piece.publicationStatus !== 'published' || piece.visualApproval !== 'approved';
  return (
    <button type="button" onClick={onOpen} data-boutique-tile={piece.assetId} aria-label={`Open ${piece.name}`}
      className="text-left flex flex-col min-h-0" style={{ width: '100%', maxWidth: single ? 480 : undefined, justifySelf: single ? 'center' : undefined, alignSelf: single ? 'center' : undefined, gridColumn: single ? '1 / -1' : undefined, gridRow: single ? '1 / -1' : undefined }}>
      <div className="w-full min-h-0 flex-1 flex items-center justify-center overflow-hidden" style={{ background: '#F5F4F2', borderRadius: 14 }}>
        <img src={piece.thumbnail} alt={piece.name} className="w-full h-full object-contain" loading="lazy" />
      </div>
      <div className="pt-2 px-0.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate" style={{ fontSize: 13, color: '#171717' }}>{piece.name}</p>
          {review && <p style={{ fontSize: 10, color: '#8A8075' }}>Preview · approval pending</p>}
        </div>
        {price && <span className="shrink-0" style={{ fontSize: 11, color: '#6E6C69' }}>{price}</span>}
        {!price && piece.inquiryState && <span className="shrink-0" style={{ fontSize: 11, color: '#6E6C69' }}>{piece.inquiryState}</span>}
      </div>
    </button>
  );
}

function PieceDetail({ piece, onClose, onAskSame }: { piece: BoutiquePiece; onClose: () => void; onAskSame: () => void }) {
  const price = boutiquePrice(piece.price);
  const knownSpecs = Object.entries(piece.essentialSpecs).filter(([key, value]) => !['physicalScaleConfirmed', 'unitMeaning', 'manufacturingReady'].includes(key) && value !== null && value !== undefined && value !== 'unknown');
  const review = piece.publicationStatus !== 'published' || piece.visualApproval !== 'approved';
  return (
    <div className="flex-1 min-h-0 flex flex-col" data-boutique-detail={piece.assetId}>
      <div className="shrink-0 pt-14 px-5 pb-2"><button type="button" onClick={onClose} className="text-[12px]" style={{ color: '#6E6C69' }}>← Boutique</button></div>
      <div className="flex-1 min-h-0 mx-auto w-full" style={{ maxWidth: 620 }}>
        {piece.assetId === 'dev-test-candidate-ring' ? <EngineJewelryViewer key={piece.interactiveGlb} src="/models/mounted-reference-ring.glb" poster={piece.poster} alt={piece.name} style={{ width: '100%', height: '100%' }} /> :
          <ModelViewer key={piece.interactiveGlb} src={piece.interactiveGlb} poster={piece.poster} alt={piece.name}
            autoRotate={false} cameraControls ar={false} cameraOrbit={piece.category === 'ring' ? '35deg 40deg 3.3m' : undefined}
            fallbackTitle={piece.name} fallbackSubtitle="3D preview unavailable" style={{ width: '100%', height: '100%' }} />}
      </div>
      <div className="shrink-0 px-6 pb-7 pt-3 mx-auto w-full" style={{ maxWidth: 620 }}>
        <h2 style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontSize: 27, color: '#171717', lineHeight: 1.1 }}>{piece.name}</h2>
        {review && <p style={{ fontSize: 10, color: '#8A8075', marginTop: 5 }}>Preview · visual approval pending</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3" style={{ fontSize: 11, color: '#6E6C69' }}>
          {knownSpecs.map(([key, value]) => <span key={key}>{key.replace(/([A-Z])/g, ' $1')}: {String(value)}</span>)}
          {piece.essentialSpecs.physicalScaleConfirmed === false && <span>Physical scale unverified</span>}
        </div>
        {price && <p style={{ marginTop: 12, fontSize: 14, color: '#171717' }}>{price}</p>}
        {!price && piece.inquiryState && <p style={{ marginTop: 12, fontSize: 12, color: '#6E6C69' }}>{piece.inquiryState}</p>}
        {piece.availabilityState && <p style={{ marginTop: 4, fontSize: 11, color: '#6E6C69' }}>{piece.availabilityState}</p>}
        <button type="button" onClick={onAskSame} className="mt-5 text-[12px]" style={{ color: '#171717', borderBottom: '1px solid #A6A6AB', paddingBottom: 2 }}>Ask SAME</button>
      </div>
    </div>
  );
}

export default function EngineBoutiquePanel({ highlightAssetId, onAskSame }: { highlightAssetId: string | null; onAskSame: (piece: BoutiquePiece) => void }) {
  const [pieces, setPieces] = useState<BoutiquePiece[]>([]);
  const [category, setCategory] = useState<BoutiqueCategory>('ring');
  const [selected, setSelected] = useState<BoutiquePiece | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    loadBoutiqueContent().then(value => { if (active) { setPieces(value); setError(false); setLoading(false); } })
      .catch(() => { if (active) { setError(true); setLoading(false); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const match = pieces.find(piece => piece.assetId === highlightAssetId);
    if (match) queueMicrotask(() => setSelected(match));
  }, [highlightAssetId, pieces]);

  const filtered = boutiqueByCategory(pieces, category);
  const groups = boutiqueGroups(filtered);
  function changeCategory(next: BoutiqueCategory) {
    setCategory(next);
    setSelected(null);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col" style={{ background: '#EAE8E4' }}>
      {selected ? <PieceDetail piece={selected} onClose={() => setSelected(null)} onAskSame={() => onAskSame(selected)} /> : <>
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ scrollSnapType: 'y mandatory', scrollbarWidth: 'none' }} data-boutique-scroll>
          {loading && <div className="h-full flex items-center justify-center" style={{ color: '#8A8075', fontSize: 12 }}>Loading pieces…</div>}
          {!loading && (error || groups.length === 0) && <div className="h-full flex items-center justify-center px-8 text-center" style={{ color: '#8A8075', fontSize: 13 }}>{error ? 'Boutique pieces are unavailable.' : 'No pieces in this category yet.'}</div>}
          {groups.map((group, index) => <section key={`${category}-${index}`} data-boutique-group={index}
            className="h-full min-h-full grid grid-cols-2 grid-rows-2 gap-3 sm:gap-5 px-4 sm:px-8 pb-5 pt-16 mx-auto"
            style={{ maxWidth: 880, scrollSnapAlign: 'start' }}>
            {group.map(piece => <PieceTile key={piece.assetId} piece={piece} single={group.length === 1} onOpen={() => setSelected(piece)} />)}
          </section>)}
        </div>
        <nav className="shrink-0 flex items-center justify-center gap-4 sm:gap-7 px-3 overflow-x-auto" style={{ minHeight: 58, borderTop: '1px solid rgba(23,23,23,0.08)', scrollbarWidth: 'none' }} aria-label="Boutique categories">
          {boutiqueCategories(pieces).map(item => <button key={item.key} type="button" onClick={() => changeCategory(item.key)} aria-current={category === item.key ? 'page' : undefined}
            className="shrink-0" style={{ fontSize: 11, color: category === item.key ? '#171717' : '#8A8075', fontWeight: category === item.key ? 600 : 400, borderBottom: category === item.key ? '1px solid #6E6C69' : '1px solid transparent', paddingBottom: 3 }}>{item.label}</button>)}
        </nav>
      </>}
    </div>
  );
}
