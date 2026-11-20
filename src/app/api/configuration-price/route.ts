import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {activityId,readActivity,writeActivity} from '@/lib/account-activity-store';
import {staffLevel,listingFailure} from '@/lib/jeweller-access';
import {privateHeaders,checkChatOrigin,readChatJson,ChatError} from '@/lib/chat-security';
import {retailQuote,settingSchema,supplierQuote} from '@/lib/supplier-pricing';
const selection=z.object({piece:z.string().min(1).max(180),setting:settingSchema,options:z.string().max(1800)});
function idFor(input:z.infer<typeof selection>){return activityId('configuration-price',JSON.stringify([input.piece,input.setting,input.options]));}
export async function GET(req:NextRequest){
 try{
   const input=selection.parse(Object.fromEntries(req.nextUrl.searchParams));
   const record=await readActivity<{retail:ReturnType<typeof retailQuote>}>(idFor(input));
   return NextResponse.json({price:record?.kind==='configuration-price'?record.data.retail:null,staff:!!staffLevel(req)},{headers:privateHeaders});
 }catch(e){return listingFailure(e);}
}
export async function POST(req:NextRequest){
 try{
   checkChatOrigin(req);
   if(!staffLevel(req))throw new ChatError(403,'Staff access required.');
   const {choice,quote}=z.object({choice:selection,quote:supplierQuote}).parse(await readChatJson(req));
   const retail=retailQuote(quote,choice.setting),id=idFor(choice);
   await writeActivity({id,kind:'configuration-price',owner:'house',subject:id,status:'published',createdAt:new Date().toISOString(),data:{choice,quote,retail}});
   return NextResponse.json({price:retail},{headers:privateHeaders});
 }catch(e){return listingFailure(e);}
}
