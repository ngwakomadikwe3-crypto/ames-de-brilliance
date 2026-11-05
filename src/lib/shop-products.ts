import { getListing } from './jeweller-listing-store';
import { verifiedListingProfile } from './jeweller-access';
import { publicListing } from './jeweller-listing';
import { activityId, readActivity } from './account-activity-store';
import {moneyMinor} from './shop-money';
export {moneyMinor,moneyLabel} from './shop-money';
export type ShopProduct={assetId:string;listingId:string;sellerId:string;name:string;businessName:string;image:string;href:string;currency:string;amountMinor:number;revision:number};
export async function shopProduct(assetId:string,forOrderId?:string):Promise<ShopProduct>{if(!/^listing-[a-f0-9-]{36}$/.test(assetId))throw Error('This is a representative preview. Ask AMES about an available piece.');const listing=await getListing(assetId.slice(8)),profile=await verifiedListingProfile(listing),p=publicListing(listing,profile.businessName);if(!p.price)throw Error('Request a quote for this piece before purchasing.');const amountMinor=moneyMinor(listing.details.amount,listing.details.currency);if(amountMinor<=0)throw Error('A valid reviewed price is required');const reservation=await readActivity<{orderId:string}>(activityId('reservation',assetId));if((reservation?.status==='active'||reservation?.status==='sold')&&reservation.data.orderId!==forOrderId)throw Error('This piece is reserved or sold.');return{assetId,listingId:listing.id,sellerId:listing.jewellerId,name:p.name,businessName:p.businessName,image:p.posterUrl,href:'/jewellery/'+listing.id,currency:p.price.currency,amountMinor,revision:listing.version};}
