'use client';
import { DesignPicture, ImageToCome } from './CustomDesigns';
import { useAtelierLanguage } from './AtelierLanguage';
import { collectionDesigns } from '../lib/collections';
import type { CollectionEntry } from '../lib/collection-logic';

/** A collection in the Boutique: the set's front views as a mosaic, its name and what is in it. */
export default function CollectionCard({ entry, onOpen }: { entry: CollectionEntry; onOpen: () => void }) {
  const { t } = useAtelierLanguage();
  const designs = collectionDesigns(entry);
  return (
    <button type="button" onClick={onOpen} data-collection-card={entry.id} className="ames-piece-tile flex flex-col text-left" aria-label={`Open ${entry.name}`}>
      <div className="grid w-full grid-cols-2 gap-1 overflow-hidden rounded-2xl">
        {designs.map(d => (
          <div key={d.code} className="aspect-[4/5] overflow-hidden">
            {d.images.front ? <DesignPicture image={d.images.front} alt={d.alt.front} sizes="(min-width: 760px) 180px, 25vw" /> : <ImageToCome label={`${d.name}: image on its way`} />}
          </div>))}
      </div>
      <p className="mt-2" style={{ fontFamily: 'var(--font-satoshi)', fontSize: 21, color: '#ffffff' }}>{t(entry.name)}</p>
      <p className="text-[11px]" style={{ color: '#ffffff' }}>{designs.map(d => t(d.name)).join(' · ')}</p>
      <p className="text-[11px]" style={{ color: '#ffffff' }}>{t('One set, shared metal and stones · set price')}</p>
    </button>
  );
}
