import {NextRequest,NextResponse} from 'next/server';
import {customerSession} from '@/lib/customer-session';
import {listActivity} from '@/lib/account-activity-store';
import {resolveMedia} from '@/lib/customer-media';
import {privateHeaders} from '@/lib/chat-security';
import {listingFailure} from '@/lib/jeweller-access';
export const runtime='nodejs';
export async function GET(req:NextRequest){try{const{user}=await customerSession(req),page=await listActivity('reaction',{owner:user.$id,status:['saved','liked_saved']},30,req.nextUrl.searchParams.get('cursor')||undefined);const saved=await Promise.all(page.records.map(async r=>{try{const m=await resolveMedia(r.subject);return{key:r.subject,name:m.name,poster:m.poster,href:'/app?media='+encodeURIComponent(r.subject),unavailable:false};}catch{return{key:r.subject,name:'Unavailable video',poster:'',href:'',unavailable:true};}}));return NextResponse.json({saved,next:page.next},{headers:privateHeaders});}catch(e){return listingFailure(e);}}
