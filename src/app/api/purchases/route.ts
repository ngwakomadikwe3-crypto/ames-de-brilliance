import {NextRequest,NextResponse} from 'next/server';
import {customerSession} from '@/lib/customer-session';
import {purchaseList,purchaseView} from '@/lib/customer-cart';
import {isStaffOwner,listingFailure} from '@/lib/jeweller-access';
import {privateHeaders,ChatError} from '@/lib/chat-security';
export const runtime='nodejs';
export async function GET(req:NextRequest){try{const staff=req.nextUrl.searchParams.get('staff')==='1';if(staff&&!isStaffOwner(req))throw new ChatError(403,'Staff access required.');const user=staff?null:(await customerSession(req)).user;const page=await purchaseList(user?.$id,req.nextUrl.searchParams.get('cursor')||undefined);return NextResponse.json({purchases:page.records.map(purchaseView),next:page.next},{headers:privateHeaders});}catch(e){return listingFailure(e);}}
