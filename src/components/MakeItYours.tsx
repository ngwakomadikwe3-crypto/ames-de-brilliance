'use client';
// "Make it yours": a piece's choices (stone, metal, size…) in one bottom sheet instead of a long list under
// the jewellery. The page shows the piece, a one-line summary of the choices and the price/quote row; the
// sheet (inside the app shell, so the house pill styles apply) opens over the lower part of the screen so the live 3D above it updates as each choice is made.
import {useEffect, useState, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {useAtelierLanguage} from './AtelierLanguage';

const bubble = {background: '#ffffff', color: '#0c3b2e'};

export default function MakeItYours({summary, children, onOpen}: {summary: string; children: ReactNode; onOpen?: () => void}) {
  const {t} = useAtelierLanguage();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [open]);
  return <>
    <div className="mt-4 flex items-center gap-3" data-make-it-yours>
      <button type="button" onClick={() => { onOpen?.(); setOpen(true); }} aria-expanded={open} className="min-h-11 shrink-0 rounded-full px-5 text-sm font-medium shadow-lg" style={bubble}>{t('Make it yours')}</button>
      {summary && <p className="min-w-0 text-xs leading-5 text-white" data-choice-summary>{summary}</p>}
    </div>
    {/* Kept mounted while closed so choices (and a running camera sizer) are not reset. */}
    {typeof document !== 'undefined' && createPortal(
      <div hidden={!open} className="fixed inset-x-0 bottom-0 z-[70]" data-make-it-yours-sheet>
        <div role="dialog" aria-label={t('Make it yours')} className="mx-auto w-full overflow-y-auto rounded-t-3xl bg-[#0b2f26]/95 px-6 pb-8 pt-4 text-white shadow-2xl backdrop-blur" style={{maxWidth: 620, maxHeight: '48dvh'}}>
          <div className="sticky top-0 z-10 -mx-6 mb-1 flex items-center justify-between bg-[#0b2f26]/95 px-6 pb-2">
            <p style={{fontFamily: 'var(--font-satoshi)', fontSize: 18}}>{t('Make it yours')}</p>
            <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-full px-5 text-sm font-medium" style={bubble}>{t('Done')}</button>
          </div>
          {children}
        </div>
      </div>, document.querySelector('.ames-app-shell') ?? document.body)}
  </>;
}
