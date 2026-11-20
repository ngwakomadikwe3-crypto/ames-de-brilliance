import {randomUUID} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {checkChatOrigin} from '@/lib/chat-security';
import {listingFailure} from '@/lib/jeweller-access';
import {createStoneRequest} from '@/lib/stone-requests';
import {settingSchema} from '@/lib/supplier-pricing';
import {sendStoneRequestNotice} from '@/lib/email';
export async function POST(req:NextRequest){
  try{
    checkChatOrigin(req);
    const f=await req.formData();
    const q=z.object({name:z.string().trim().min(1).max(150),contact:z.email(),color:z.string().trim().min(1).max(150),
      shape:settingSchema,metal:z.string().max(100),notes:z.string().max(3500),country:z.string().max(150),consent:z.literal('on'),configuration:z.string().max(2000)}).parse(Object.fromEntries(f));
    const id=randomUUID(),ref='AMES-'+id.slice(0,8).toUpperCase();
    await createStoneRequest({$id:'guest-'+id,name:q.name,email:q.contact},{stoneId:id,ref,title:q.color,carats:0,configuration:q.configuration},
      {stoneId:id,setting:q.shape,metal:q.metal,phone:'',message:q.notes+'\nDelivery country: '+q.country});
    await sendStoneRequestNotice(ref,q.color,q.name,q.contact).catch(()=>false);
    return NextResponse.json({id:ref},{status:201});
  }catch(e){return listingFailure(e)}
}
