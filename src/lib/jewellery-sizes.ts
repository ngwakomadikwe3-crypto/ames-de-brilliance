// Size options for every piece of jewellery and every gemstone the house shows (Boutique and Gemstones).
// A size is part of the configuration: it is written into the price key and the made-to-order quote, so a
// supplier prices the piece that was actually chosen. '' means the customer has not chosen yet; the quote
// then asks the house to confirm the size with them (the try-on can measure a ring finger or a wrist).

export type SizeOption = { key: string; label: string; choices: Record<string, string> };

const ringSizes: [string, string][] = [
  ['4', 'H½'], ['4.5', 'I½'], ['5', 'J½'], ['5.5', 'K½'], ['6', 'L½'], ['6.5', 'M½'], ['7', 'N½'],
  ['7.5', 'O½'], ['8', 'P½'], ['8.5', 'Q½'], ['9', 'R½'], ['9.5', 'S½'], ['10', 'T½'], ['10.5', 'U½'], ['11', 'V½'],
];
const notYet = { '': 'Not sure yet' };

const RING: SizeOption = { key: 'ringSize', label: 'Ring size', choices: { ...notYet, ...Object.fromEntries(ringSizes.map(([us, uk]) => [`US ${us} · UK ${uk}`, `US ${us} · UK ${uk}`])) } };
const BRACELET: SizeOption = { key: 'length', label: 'Bracelet length', choices: { ...notYet, ...Object.fromEntries(['15 cm', '16 cm', '17 cm', '18 cm', '19 cm', '20 cm'].map(v => [v, v])) } };
const NECKLACE: SizeOption = { key: 'length', label: 'Chain length', choices: { ...notYet, '40 cm (16 in)': '40 cm · choker', '42 cm (16.5 in)': '42 cm', '45 cm (18 in)': '45 cm · collarbone', '50 cm (20 in)': '50 cm', '55 cm (22 in)': '55 cm · neckline' } };
const EARRINGS: SizeOption = { key: 'dropSize', label: 'Earring size', choices: { ...notYet, 'Petite': 'Petite', 'Classic': 'Classic', 'Statement': 'Statement' } };
const WATCH_CASE: SizeOption = { key: 'case', label: 'Case size', choices: { ...notYet, '36 mm': '36 mm', '40 mm': '40 mm', '42 mm': '42 mm', '44 mm': '44 mm' } };
const WRIST: SizeOption = { key: 'wrist', label: 'Wrist size', choices: { ...notYet, ...Object.fromEntries(['15 cm', '16 cm', '17 cm', '18 cm', '19 cm', '20 cm', '21 cm'].map(v => [v, v])) } };

/** Size of the coloured (feature) stone, by weight. Diamonds in a Boutique piece are priced by the house. */
export const STONE_SIZE: SizeOption = { key: 'stoneSize', label: 'Stone size', choices: { ...notYet, ...Object.fromEntries(['0.5 ct', '0.75 ct', '1 ct', '1.5 ct', '2 ct', '3 ct', '5 ct'].map(v => [v, v])) } };

export function sizeOptions(setting: string, { stone = false }: { stone?: boolean } = {}): SizeOption[] {
  const piece = setting === 'ring' ? [RING] : setting === 'bracelet' ? [BRACELET] : setting === 'necklace' || setting === 'pendant' ? [NECKLACE]
    : setting === 'earrings' ? [EARRINGS] : setting === 'watch' ? [WATCH_CASE, WRIST] : [];
  return [...(stone || setting === 'loose' ? [STONE_SIZE] : []), ...piece];
}

/** The chosen sizes as configuration words, e.g. "Ring size US 6 · UK L½ · Stone size 1 ct". Unchosen sizes are left out. */
export function sizeConfiguration(options: SizeOption[], chosen: Record<string, string>): string {
  return options.filter(o => chosen[o.key]).map(o => `${o.label} ${chosen[o.key]}`).join(' · ');
}
