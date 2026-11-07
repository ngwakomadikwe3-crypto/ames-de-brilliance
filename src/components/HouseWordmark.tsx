import { Pinyon_Script } from 'next/font/google';

/** Copperplate script for the “of” of the wordmark. */
const script = Pinyon_Script({ weight: '400', subsets: ['latin'], display: 'swap' });

/**
 * The HOUSEofAMES wordmark: HOUSE and AMES in wide-set capitals, “of” in script.
 * tone="silver" is the platinum gradient for dark grounds (the app and dashboard), "ink" for light grounds.
 */
export default function HouseWordmark({ size = 13, tone = 'silver', className }: { size?: number; tone?: 'silver' | 'ink' | 'light'; className?: string }) {
  const colour = tone === 'silver'
    ? { background: 'linear-gradient(100deg, #f4f2ed 0%, #c8c6c1 55%, #a6a6ab 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }
    : { color: tone === 'ink' ? '#171717' : '#F5F5F2' };
  return <span role="img" aria-label="House of Ames" className={className} style={{ fontFamily: 'var(--font-satoshi), Arial, sans-serif', fontSize: size, fontWeight: 600, letterSpacing: '0.34em', lineHeight: 1.9, whiteSpace: 'nowrap', textTransform: 'none', ...colour }}>
    HOUSE<span className={script.className} style={{ fontSize: '1.7em', fontWeight: 400, letterSpacing: 0, margin: '0 0.2em 0 -0.12em', verticalAlign: '-0.08em' }}>of</span>AMES
  </span>;
}
