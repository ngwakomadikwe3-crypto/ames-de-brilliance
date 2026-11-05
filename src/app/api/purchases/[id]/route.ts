import {NextRequest,NextResponse} from 'next/server';
import {customerSession} from '@/lib/customer-session';
import {changePurchase,purchaseView,type PurchaseData} from '@/lib/customer-cart';
import {readActivity} from '@/lib/account-activity-store';
import {withListingLock} from '@/lib/jeweller-listing-store';
import {isStaffOwner,listingFailure} from '@/lib/jeweller-access';
import {checkChatOrigin,privateHeaders,readChatJson,ChatError} from '@/lib/chat-security';
export const runtime='nodejs';
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{checkChatOrigin(req);const{id}=await params,body=await readChatJson(req),staff=isStaffOwner(req),user=staff?null:(await customerSession(req,true)).user;const result=await withListingLock(id,async()=>{const order=await readActivity<PurchaseData>(id);if(!order||order.kind!=='purchase'||!staff&&order.owner!==user!.$id)throw new ChatError(404,'Purchase not found.');return changePurchase(order,body,staff);});return NextResponse.json(purchaseView(result),{headers:privateHeaders});}catch(e){return listingFailure(e);}}
