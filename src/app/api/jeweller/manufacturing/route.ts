import {NextRequest,NextResponse} from 'next/server';
import {signedInJeweller,listingFailure} from '@/lib/jeweller-access';
import {checkChatOrigin,privateHeaders} from '@/lib/chat-security';
import {listStoneRequests,recordMakerCost} from '@/lib/stone-requests';
import {sendMakerQuoteNotice} from '@/lib/email';

export async function GET(req:NextRequest){
  try {
    const maker=await signedInJeweller(req), jobs=[];
    let cursor:string|undefined;
    do {
      const page=await listStoneRequests(undefined,cursor);
      for(const r of page.records) if(r.data.makerId===maker.id && r.status!=='closed' && !r.data.makerCost){
        const {title,ref,setting,metal,configuration}=r.data;
        jobs.push({id:r.id,title,ref,setting,metal,configuration});
      }
      cursor=page.next??undefined;
    } while(cursor);
    return NextResponse.json(jobs,{headers:privateHeaders});
  } catch(e){return listingFailure(e)}
}
export async function POST(req:NextRequest){
  try {
    checkChatOrigin(req);
    const maker=await signedInJeweller(req);
    const record=await recordMakerCost(maker.id,await req.json());
    await sendMakerQuoteNotice(record.data.ref,maker.businessName);
    return NextResponse.json({ok:true},{headers:privateHeaders});
  }catch(e){return listingFailure(e)}
}
