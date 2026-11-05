import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {isStaffOwner,listingFailure} from '@/lib/jeweller-access';
import {listActivity,readActivity,writeActivity} from '@/lib/account-activity-store';
import {checkChatOrigin,readChatJson,privateHeaders,ChatError} from '@/lib/chat-security';
import type {Comment} from '@/lib/media-community';
export const runtime='nodejs';
export async function GET(req:NextRequest){try{if(!isStaffOwner(req))throw new ChatError(403,'Staff access required.');const page=await listActivity<{reason:string;mediaKey:string}>('report',{status:'open'},50);const reports=await Promise.all(page.records.map(async r=>{const comment=await readActivity<Comment>(r.subject);return{id:r.id,commentId:r.subject,key:r.data.mediaKey,reason:r.data.reason,text:comment?.data.text||'Comment removed',author:comment?.data.author||'',status:comment?.status||'deleted'};}));return NextResponse.json({reports},{headers:privateHeaders});}catch(e){return listingFailure(e);}}
export async function POST(req:NextRequest){try{checkChatOrigin(req);if(!isStaffOwner(req))throw new ChatError(403,'Staff access required.');const b=await readChatJson(req),r=await readActivity(z.uuid().parse(b.id));if(!r||r.kind!=='report')throw new ChatError(404,'Report unavailable');await writeActivity({...r,status:'closed'});return NextResponse.json({ok:true},{headers:privateHeaders});}catch(e){return listingFailure(e);}}
