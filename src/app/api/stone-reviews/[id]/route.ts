import { NextRequest, NextResponse } from 'next/server';
import { jewelryOwnerGuard } from '@/lib/jewelry-auth';
import { reviewDetail, saveReview, publishReview } from '@/lib/stone-review-store';
const headers={'Cache-Control':'private, no-store'};
type Context={params:Promise<{id:string}>};
export async function GET(request:NextRequest,{params}:Context){
  const denied=jewelryOwnerGuard(request);if(denied)return denied;
  try{return NextResponse.json(await reviewDetail((await params).id),{headers});}
  catch{return NextResponse.json({error:'Stone review unavailable. Check storage access.'},{status:503,headers});}
}
export async function POST(request:NextRequest,{params}:Context){
  const denied=jewelryOwnerGuard(request);if(denied)return denied;
  try{
    const body=await request.json(),id=(await params).id;
    const actor=typeof body.reviewer==='string'?body.reviewer.trim():'';
    if(actor.length<3||actor.length>120)throw new Error('Enter the responsible reviewer name.');
    if(body.action==='save')return NextResponse.json(await saveReview(id,body.review,actor,'Saved verification draft'),{headers});
    if(body.action==='withdraw'){
      const detail=await reviewDetail(id);
      if(!detail.draft)throw new Error('No review to withdraw.');
      const reason=typeof body.reason==='string'?body.reason.trim():'';
      if(!reason||reason.length>2000)throw new Error('Enter the withdrawal reason.');
      return NextResponse.json(await saveReview(id,detail.draft.review,actor,`Withdrawn: ${reason}`),{headers});
    }
    if(body.action==='publish'&&body.confirmed===true&&typeof body.draftId==='string')return NextResponse.json(await publishReview(id,body.draftId,actor),{headers});
    throw new Error('Choose a valid action and explicitly confirm publication.');
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Review action failed'},{status:400,headers});}
}
