import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {getListing} from './jeweller-listing-store';
import {verifiedListingProfile} from './jeweller-access';
import {publicListing} from './jeweller-listing';
import {loadBoutiqueContent} from './ames-boutique-content';
import {showCustomerJewelry} from './customer-jewelry-display';

/** Public/visible piece identity is checked on reads and comment creation. No price required. */
export async function resolveCommentPiece(key:string) {
  const id=key.slice(6);
  if (!key.startsWith('piece:') || !/^[a-z0-9][a-z0-9-]{1,100}$/.test(id)) throw Error('Piece unavailable');
  if(id.startsWith('listing-')) {
    if(!/^listing-[a-f0-9-]{36}$/.test(id))throw Error('Piece unavailable');
    const listing=await getListing(id.slice(8)),profile=await verifiedListingProfile(listing);
    return publicListing(listing,profile.businessName);
  }
  const fetcher=async(input:RequestInfo|URL)=>{
    const path=String(input);
    if(!/^\/ames-engine\/[a-z0-9/._-]+\.json$/.test(path)||path.split('/').includes('..'))throw Error('Piece unavailable');
    return new Response(await readFile(join(process.cwd(),'public',path.slice(1)),'utf8'));
  };
  const piece=(await loadBoutiqueContent(fetcher as typeof fetch)).find(p=>p.assetId===id&&showCustomerJewelry(id));
  if(!piece)throw Error('Piece unavailable');
  return piece;
}
