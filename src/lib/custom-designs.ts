// The eight default custom-order designs. One record per design code (W1 W2 B1 B2 N1 N2 E1 E2): the catalogue,
// the custom-order flow, the try-on and the future 3D models all refer to these codes.
//
// images: { front, back } are the official renders (public/atelier/designs/<CODE>/, built by
// scripts/build-design-images.mjs). They are each design's visual identity until its GLB exists, and the
// permanent fallback after: if the GLB is missing, fails, or the device cannot run the viewer, these show.
// A render that has not been delivered yet is null and the page says so; it is never cropped or faked.
import manifest from './custom-design-images.json';

export type DesignCode = 'W1' | 'W2' | 'B1' | 'B2' | 'N1' | 'N2' | 'E1' | 'E2';
export type DesignImage = { src: string; base: string; width: number; height: number; widths: number[] };
export type DesignOption = { key: string; label: string; choices: string[] };
export type WearState = 'stud' | 'full';

export interface CustomDesign {
  code: DesignCode;
  name: string;
  /** Boutique category key the design appears under. */
  category: 'watch' | 'bracelet' | 'necklace' | 'earrings';
  summary: string;
  images: { front: DesignImage | null; back: DesignImage | null };
  alt: { front: string; back: string };
  /** The design's own 3D model, when built. Until then the renders are the design. */
  glb: string | null;
  options: DesignOption[];
  /** Two-in-one earrings: a stud plus a detachable element that locks on. */
  convertible?: {
    detachable: 'drop' | 'jacket';
    stateLabels: Record<WearState, string>;
    mechanism: string;
    /** GLB contract: the stud and the detachable element are separate nodes, never one fused mesh. */
    parts: { stud: string; detachable: string };
    /** The stud worn alone, front view (generated separately). Null until delivered. */
    studFront: DesignImage | null;
    studAlt: string;
  };
}

const img = (code: DesignCode, view: string) => ((manifest as Record<string, Record<string, DesignImage | null>>)[code]?.[view] ?? null);
const METAL: DesignOption = { key: 'metal', label: 'Metal', choices: ['925 silver, rhodium plated', '18k white gold', '18k yellow gold', '18k rose gold', 'Platinum'] };
const STONES: DesignOption = { key: 'stones', label: 'Stones', choices: ['Moissanite', 'Lab-grown diamond', 'Natural diamond'] };

export const CUSTOM_DESIGNS: CustomDesign[] = [
  {
    code: 'W1', name: 'The Classic Pavé', category: 'watch',
    summary: 'Round iced watch: graduated brilliants around the bezel, a pavé dial under polished hands, a date window at 3 o’clock, and links that flow from the case.',
    images: { front: img('W1', 'front'), back: img('W1', 'back') },
    alt: { front: 'The Classic Pavé watch — front view, diamond bezel and Roman numeral dial on emerald silk', back: 'The Classic Pavé watch — back view, case back and bracelet links on emerald silk' },
    glb: null,
    options: [METAL, { key: 'case', label: 'Case', choices: ['40 mm', '42 mm', '44 mm'] }, { key: 'dial', label: 'Dial', choices: ['Pavé, Roman numerals', 'Pavé, baguette markers'] },
      { key: 'strap', label: 'Strap', choices: ['Iced bracelet', 'Leather strap'] }, STONES],
  },
  {
    code: 'W2', name: 'The Square Boutique', category: 'watch',
    summary: 'Square iced watch: a braided pavé frame around a pavé dial with black Roman numerals, stones down the case sides and around the crown.',
    images: { front: img('W2', 'front'), back: img('W2', 'back') },
    alt: { front: 'The Square Boutique watch — front view, braided pavé frame and Roman numeral dial on emerald silk', back: 'The Square Boutique watch — back view, case back and pavé case sides on emerald silk' },
    glb: null,
    options: [METAL, { key: 'case', label: 'Case', choices: ['34 mm', '38 mm'] }, { key: 'frame', label: 'Frame', choices: ['Braided pavé', 'Plain pavé'] },
      { key: 'strap', label: 'Strap', choices: ['Iced bracelet', 'Leather strap'] }, STONES],
  },
  {
    code: 'B1', name: 'The Tennis Line', category: 'bracelet',
    summary: 'A single line of matched brilliants, each in its own setting, closing with a hidden box clasp and safety latch.',
    images: { front: img('B1', 'front'), back: img('B1', 'back') },
    alt: { front: 'The Tennis Line bracelet — front view, a single line of brilliants on emerald silk', back: 'The Tennis Line bracelet — back view, settings and box clasp on emerald silk' },
    glb: null,
    options: [METAL, { key: 'length', label: 'Length', choices: ['16 cm', '17 cm', '18 cm', '19 cm'] }, { key: 'stoneSize', label: 'Stone size', choices: ['2 mm', '3 mm', '4 mm'] }, STONES],
  },
  {
    code: 'B2', name: 'The Pavé Bangle', category: 'bracelet',
    summary: 'A solid bangle paved with stones, opening on a concealed hinge.',
    images: { front: img('B2', 'front'), back: img('B2', 'back') },
    alt: { front: 'The Pavé Bangle — front view, pavé surface on emerald silk', back: 'The Pavé Bangle — back view, hinge and inner band on emerald silk' },
    glb: null,
    options: [METAL, { key: 'size', label: 'Inner size', choices: ['Small (56 mm)', 'Medium (60 mm)', 'Large (64 mm)'] }, { key: 'coverage', label: 'Pavé', choices: ['Top half', 'All the way round'] }, STONES],
  },
  {
    code: 'N1', name: 'The Rivière Drop', category: 'necklace',
    summary: 'A rivière of graduated stones finishing in a single pear drop at the centre.',
    images: { front: img('N1', 'front'), back: img('N1', 'back') },
    alt: { front: 'The Rivière Drop necklace — front view, graduated stones and pear drop on emerald silk', back: 'The Rivière Drop necklace — back view, settings and clasp on emerald silk' },
    glb: null,
    options: [METAL, { key: 'length', label: 'Length', choices: ['40 cm', '42 cm', '45 cm'] }, { key: 'drop', label: 'Centre drop', choices: ['Pear, about 1.5 ct', 'Pear, about 2 ct', 'Pear, about 3 ct'] }, STONES],
  },
  {
    code: 'N2', name: 'The Solitaire Pendant', category: 'necklace',
    summary: 'One centre stone on a fine chain: the cut, the size and the setting are yours to choose.',
    images: { front: img('N2', 'front'), back: img('N2', 'back') },
    alt: { front: 'The Solitaire Pendant necklace — front view, single stone on a fine chain on emerald silk', back: 'The Solitaire Pendant necklace — back view, setting gallery and bail on emerald silk' },
    glb: null,
    options: [METAL, { key: 'chain', label: 'Chain length', choices: ['40 cm', '45 cm', '50 cm'] }, { key: 'cut', label: 'Centre cut', choices: ['Round', 'Oval', 'Pear', 'Cushion'] },
      { key: 'centre', label: 'Centre size', choices: ['0.5 ct', '1 ct', '1.5 ct', '2 ct'] }, { key: 'setting', label: 'Setting', choices: ['Four prongs', 'Six prongs', 'Halo'] }, STONES],
  },
  {
    code: 'E1', name: 'The Cascade Drop', category: 'earrings',
    summary: 'A pear stud with a detachable three-stone drop: the stud alone by day, the full cascade by evening.',
    images: { front: img('E1', 'front'), back: img('E1', 'back') },
    alt: { front: 'The Cascade Drop earrings — front view, pear stud with round and pear drop on emerald silk', back: 'The Cascade Drop earrings — back view, the loop-and-notch lock behind the stud gallery on emerald silk' },
    glb: null,
    options: [METAL, { key: 'drop', label: 'Drop', choices: ['Full cascade (as shown)', 'Shorter, two stones'] }, { key: 'back', label: 'Earring back', choices: ['Push back', 'Screw back'] }, STONES],
    convertible: {
      detachable: 'drop', stateLabels: { stud: 'Stud', full: 'Full drop' },
      mechanism: 'The drop hooks onto the stud with a hidden loop-and-notch lock behind the stud’s gallery: invisible from the front, secure in wear.',
      parts: { stud: 'E1_stud', detachable: 'E1_drop' },
      studFront: img('E1', 'stud-front'), studAlt: 'The Cascade Drop earrings worn as studs — front view, pear studs on emerald silk',
    },
  },
  {
    code: 'E2', name: 'The Convertible Stud', category: 'earrings',
    summary: 'A solitaire stud with a detachable halo jacket: the solitaire alone, or framed in a ring of stones.',
    images: { front: img('E2', 'front'), back: img('E2', 'back') },
    alt: { front: 'The Convertible Stud earrings — front view, round solitaires in pavé halos on emerald silk', back: 'The Convertible Stud earrings — back view, the halo jacket separated from the solitaire stud on emerald silk' },
    glb: null,
    options: [METAL, { key: 'centre', label: 'Centre size', choices: ['0.5 ct each', '1 ct each', '1.5 ct each'] }, { key: 'back', label: 'Earring back', choices: ['Push back', 'Screw back'] }, STONES],
    convertible: {
      detachable: 'jacket', stateLabels: { stud: 'Stud', full: 'With halo' },
      mechanism: 'The halo jacket slides onto the stud’s post behind the solitaire and is held by the earring back.',
      parts: { stud: 'E2_stud', detachable: 'E2_jacket' },
      studFront: img('E2', 'stud-front'), studAlt: 'The Convertible Stud earrings worn as solitaire studs — front view on emerald silk',
    },
  },
];

export const designByCode = (code: string) => CUSTOM_DESIGNS.find(d => d.code === code.toUpperCase());
export const designsInCategory = (category: string) => CUSTOM_DESIGNS.filter(d => d.category === category);

/** Every render a design should have, and which are still to come (shown to staff, never faked for customers). */
export function missingImages(design: CustomDesign) {
  const out: string[] = [];
  if (!design.images.front) out.push('front view');
  if (!design.images.back) out.push('back view');
  if (design.convertible && !design.convertible.studFront) out.push(`${design.convertible.stateLabels.stud.toLowerCase()}-alone front view`);
  return out;
}

/** In a design GLB, hide or show the detachable element (node named in parts.detachable) for the wear state. */
export function applyWearState(root: { traverse: (fn: (o: { name: string; visible: boolean }) => void) => void }, design: CustomDesign, state: WearState) {
  const name = design.convertible?.parts.detachable; if (!name) return;
  root.traverse(o => { if (o.name === name || o.name.startsWith(name + '_')) o.visible = state === 'full'; });
}
