// The collections on sale. Each entry is data only: it assembles existing designs by code (custom-designs.ts),
// so the catalogue, the images, the 3D models and the Fitting Registry all stay the single source.
// Add a set by adding an entry: 2 to 4 pieces, optional themed defaults, optional season window.
import { CUSTOM_DESIGNS, type CustomDesign } from './custom-designs';
import { isActive, type CollectionEntry } from './collection-logic';

export const COLLECTIONS: CollectionEntry[] = [
  {
    id: 'the-house-suite', name: 'The House Suite',
    description: 'The statement set: the Classic Pavé watch, the Pavé Bangle, the Rivière Drop and the Cascade Drop earrings. Graduated brilliants and full pavé throughout, made to be worn together.',
    pieces: ['W1', 'B2', 'N1', 'E1'],
  },
  {
    id: 'the-everyday-suite', name: 'The Everyday Suite',
    description: 'The everyday set: the Square Boutique watch, the Tennis Line, the Solitaire Pendant and the Convertible Studs. Clean single lines of stones that work from morning to evening.',
    pieces: ['W2', 'B1', 'N2', 'E2'],
  },
  // Examples of what the registry allows, as data (not listed until enabled):
  //   { id: 'evening-set', name: 'The Evening Set', description: '…', pieces: ['N1', 'E1'] },
  //   { id: 'sapphire-suite', name: 'The Sapphire Suite', description: '…', pieces: ['W1', 'B1', 'N2', 'E2'], defaults: { accent: 'Sapphire' } },
  //   { id: 'festive-2026', name: 'Festive Edit', description: '…', pieces: ['B1', 'N2', 'E2'], season: { from: '2026-12-01', until: '2027-01-10', label: 'Festive season' } },
];

export const activeCollections = (today = new Date()) => COLLECTIONS.filter(c => isActive(c, today));
export const collectionById = (id: string) => COLLECTIONS.find(c => c.id === id);
export const collectionDesigns = (c: CollectionEntry): CustomDesign[] =>
  c.pieces.map(code => CUSTOM_DESIGNS.find(d => d.code === code)).filter((d): d is CustomDesign => !!d);
/** Heaviest visual first: the scene loads pieces in this order (necklace first, watch last). */
export const LOAD_ORDER: Record<string, number> = { necklace: 0, earrings: 1, bracelet: 2, watch: 3 };
