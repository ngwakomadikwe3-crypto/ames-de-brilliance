import {NextRequest,NextResponse} from 'next/server';
import {customerSession} from '@/lib/customer-session';
import {checkout,purchaseView} from '@/lib/customer-cart';
import {checkChatOrigin,readChatJson,privateHeaders,consumeQuota} from '@/lib/chat-security';
import {listingFailure} from '@/lib/jeweller-access';
export const runtime='nodejs';
export async function POST(req:NextRequest){try{checkChatOrigin(req);const{user}=await customerSession(req,true);await consumeQuota('invoice-request:'+user.$id,5);const order=await checkout(user,await readChatJson(req));return NextResponse.json(purchaseView(order),{status:201,headers:privateHeaders});}catch(e){return listingFailure(e);}}
