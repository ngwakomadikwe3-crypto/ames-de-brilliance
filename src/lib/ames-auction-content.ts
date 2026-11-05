import type { BoutiquePiece } from './ames-boutique-content';

// Match explicit loose-stone categories, never jewelry names or embedded stones.
const AUCTION_CATEGORIES = new Set(['diamond', 'ruby', 'sapphire', 'emerald', 'precious-stone']);

export function auctionStonePreviews(pieces: BoutiquePiece[]): BoutiquePiece[] {
  return pieces.filter(piece => AUCTION_CATEGORIES.has(piece.category.toLowerCase()));
}
