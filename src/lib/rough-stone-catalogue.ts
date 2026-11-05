import type { PublicStoneRecord } from './stone-verification';

/** Apply after publication checks. All gemstone species are eligible. */
export function roughStonesOnly(items: PublicStoneRecord[]): PublicStoneRecord[] {
  return items.filter(item => item.form === 'rough');
}
export function searchRoughStones(items: PublicStoneRecord[], query: string, species = ''): PublicStoneRecord[] {
  const term = query.trim().toLocaleLowerCase();
  return roughStonesOnly(items).filter(item => (!species || item.species === species)
    && (!term || `${item.ref} ${item.title} ${item.species}`.toLocaleLowerCase().includes(term)));
}
