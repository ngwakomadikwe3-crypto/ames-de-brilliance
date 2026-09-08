import {NextResponse} from 'next/server';
import {customerIdentity,staffIdentity,sameOrigin} from './legacy-auth.mjs';
import {getDb,DB_ID} from './appwrite';
export async function chatAccess(req:Request,id?:string){
 try{
  if(!getDb())return {response:NextResponse.json({error:'Chat storage is unavailable'},{status:503})};
  if(req.method!=='GET'&&!sameOrigin(req))return {response:NextResponse.json({error:'Origin denied'},{status:403})};
  const user=await customerIdentity(req),staff=await staffIdentity(req);
  if(!user&&!staff)return {response:NextResponse.json({error:'Sign in required'},{status:401})};
  if(id){const chat=await getDb().getDocument({databaseId:DB_ID,collectionId:'chats',documentId:id});if(!staff&&!user?.admin&&(!chat.userId||chat.userId!==user?.id))return {response:NextResponse.json({error:'Chat unavailable'},{status:404})};}
  return {user,admin:!!staff||!!user?.admin};
 }catch(e:any){return {response:NextResponse.json({error:'Chat unavailable'},{status:e.code===404?404:503})};}
}
