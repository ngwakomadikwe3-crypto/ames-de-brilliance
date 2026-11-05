import {NextRequest,NextResponse} from 'next/server';
import {customerSession} from '@/lib/customer-session';
import {cartView,changeCart} from '@/lib/customer-cart';
import {checkChatOrigin,readChatJson,privateHeaders} from '@/lib/chat-security';
import {listingFailure} from '@/lib/jeweller-access';
export const runtime='nodejs';
export async function GET(req:NextRequest){try{const{user}=await customerSession(req);return NextResponse.json(await cartView(user.$id),{headers:privateHeaders});}catch(e){return listingFailure(e);}}
export async function POST(req:NextRequest){try{checkChatOrigin(req);const{user}=await customerSession(req);await changeCart(user.$id,await readChatJson(req));return NextResponse.json(await cartView(user.$id),{headers:privateHeaders});}catch(e){return listingFailure(e);}}
