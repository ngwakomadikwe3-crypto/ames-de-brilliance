import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {activityId,readActivity,writeActivity} from '@/lib/account-activity-store';
import {staffLevel,listingFailure} from '@/lib/jeweller-access';
import {privateHeaders,checkChatOrigin,readChatJson,ChatError} from '@/lib/chat-security';
import {DEFAULT_SET_DISCOUNT,DISCOUNT_RANGE} from '@/lib/collection-logic';

// The set discount is the owner's business decision: staff set it here (default 10 %). It is kept between 1 and
// 50 %, so a collection is always cheaper than its pieces bought separately.
const ID=activityId('collection-settings','house');
export async function GET(req:NextRequest){
 try{
   const record=await readActivity<{discount:number}>(ID);
   const discount=record?.kind==='collection-settings'&&Number.isFinite(record.data.discount)?record.data.discount:DEFAULT_SET_DISCOUNT;
   return NextResponse.json({discount,staff:!!staffLevel(req)},{headers:privateHeaders});
 }catch(e){return listingFailure(e);}
}
export async function POST(req:NextRequest){
 try{
   checkChatOrigin(req);
   if(!staffLevel(req))throw new ChatError(403,'Staff access required.');
   const {discount}=z.object({discount:z.number().min(DISCOUNT_RANGE.min).max(DISCOUNT_RANGE.max)}).parse(await readChatJson(req));
   await writeActivity({id:ID,kind:'collection-settings',owner:'house',subject:ID,status:'published',createdAt:new Date().toISOString(),data:{discount}});
   return NextResponse.json({discount},{headers:privateHeaders});
 }catch(e){return listingFailure(e);}
}
