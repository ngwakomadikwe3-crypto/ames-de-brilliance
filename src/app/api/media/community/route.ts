import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {customerSession} from '@/lib/customer-session';
import {communityView,setReaction,postComment,editComment,reportComment,mediaKey} from '@/lib/media-community';
import {checkChatOrigin,readChatJson,privateHeaders,consumeQuota,ChatError} from '@/lib/chat-security';
import {isStaffOwner,listingFailure} from '@/lib/jeweller-access';
export const runtime='nodejs';
export async function GET(req:NextRequest){try{const key=mediaKey.parse(req.nextUrl.searchParams.get('key'));let userId:string|undefined;if(req.cookies.has('ames_customer_session'))try{userId=(await customerSession(req)).user.$id;}catch(e){if(!(e instanceof ChatError&&e.status===401))throw e;}return NextResponse.json(await communityView(key,userId,req.nextUrl.searchParams.get('cursor')||undefined),{headers:privateHeaders});}catch(e){return listingFailure(e);}}
export async function POST(req:NextRequest){try{checkChatOrigin(req);const b=await readChatJson(req),key=mediaKey.parse(b.key);if(b.action==='hide'&&isStaffOwner(req)){await editComment('',key,z.uuid().parse(b.id),'hide',true);return NextResponse.json({ok:true},{headers:privateHeaders});}const{user}=await customerSession(req,b.action==='comment'||b.action==='report');await consumeQuota('media-'+String(b.action)+':'+user.$id,b.action==='comment'?6:60);
 if(b.action==='like'||b.action==='save'){const value=z.boolean().parse(b.value);await setReaction(user.$id,key,b.action==='like'?{liked:value}:{saved:value});}
 else if(b.action==='comment')await postComment(user,key,b.text);
 else if(b.action==='delete')await editComment(user.$id,key,z.uuid().parse(b.id),'delete',isStaffOwner(req));
 else if(b.action==='report')await reportComment(user.$id,key,z.uuid().parse(b.id),b.reason);
 else throw Error('Unknown media action');
 return NextResponse.json({ok:true},{headers:privateHeaders});}catch(e){return listingFailure(e);}}
