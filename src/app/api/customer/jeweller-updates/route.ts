import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {customerSession} from '@/lib/customer-session';
import {activityId,listActivity,readActivity,writeActivity} from '@/lib/account-activity-store';
import {getListing,listListings,withListingLock} from '@/lib/jeweller-listing-store';
import {verifiedListingProfile,listingFailure} from '@/lib/jeweller-access';
import {getProfile} from '@/lib/jeweller-store';
import {effectiveProfileStatus} from '@/lib/jeweller-profile';
import {publicStorefront} from '@/lib/public-storefront';
import {checkChatOrigin,privateHeaders,readChatJson} from '@/lib/chat-security';
type Follow={since:string;seenThrough:string};
const reply=(value:unknown)=>NextResponse.json(value,{headers:privateHeaders});
async function maker(target:string){
 if(target.startsWith('listing:')){
   const l=await getListing(z.uuid().parse(target.slice(8)));
   if(l.status!=='published')throw Error('Piece unavailable');
   return (await verifiedListingProfile(l)).id;
 }
 return (await publicStorefront(target)).profile.id;
}
export async function GET(req:NextRequest){
 try{
   if(!req.cookies.has('ames_customer_session'))return reply({signedIn:false,following:false,updates:[]});
   const owner=(await customerSession(req)).user.$id,target=req.nextUrl.searchParams.get('target');
   if(target){const id=await maker(target);return reply({signedIn:true,following:(await readActivity(activityId('maker-follow',owner+':'+id)))?.status==='active'})}
   const follows=[];let cursor:string|undefined;
   do{const page=await listActivity<Follow>('maker-follow',{owner,status:'active'},100,cursor);follows.push(...page.records);cursor=page.next??undefined}while(cursor);
   if(!follows.length)return reply({signedIn:true,updates:[]});
   const listings=await listListings(),updates=[];
   for(const f of follows){
     const p=await getProfile(f.subject);if(effectiveProfileStatus(p)!=='verified')continue;
     for(const l of listings){
       if(l.jewellerId!==p.id||l.status!=='published')continue;
       const at=l.audit.find(a=>a.action.includes('publish'))?.at;
       if(at && at>f.data.since && at>f.data.seenThrough)updates.push({id:l.id,name:l.details.name,maker:p.businessName,at});
     }
   }
   return reply({signedIn:true,updates:updates.sort((a,b)=>b.at.localeCompare(a.at)).slice(0,30)});
 }catch(e){return listingFailure(e)}
}
export async function POST(req:NextRequest){
 try{
   checkChatOrigin(req);const owner=(await customerSession(req)).user.$id;
   const {target,action}=z.object({target:z.string().min(1).max(100),action:z.enum(['follow','unfollow','seen'])}).parse(await readChatJson(req));
   const subject=await maker(target),id=activityId('maker-follow',owner+':'+subject);
   return await withListingLock(id,async()=>{
     const old=await readActivity<Follow>(id),now=new Date().toISOString();
     if(action==='seen'&&old&&target.startsWith('listing:')){
       const l=await getListing(target.slice(8)),at=l.audit.find(a=>a.action.includes('publish'))?.at;
       if(at && at>old.data.seenThrough)await writeActivity({...old,data:{...old.data,seenThrough:at}});
     }else if(action!=='seen'){
       const status=action==='follow'?'active':'inactive';
       if(old?.status!==status)await writeActivity({id,kind:'maker-follow',owner,subject,status,createdAt:now,data:{since:now,seenThrough:''}},!old);
     }
     return reply({ok:true});
   });
 }catch(e){return listingFailure(e)}
}
