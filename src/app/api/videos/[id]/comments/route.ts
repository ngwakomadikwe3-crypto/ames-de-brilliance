import { NextRequest, NextResponse } from 'next/server';
import { GET as get, POST as post } from '@/app/api/media/community/route';
import { privateHeaders } from '@/lib/chat-security';
export async function GET(req: NextRequest, {params}: {params: Promise<{id:string}>}) {
 const url = new URL('/api/media/community',req.url); url.searchParams.set('key','video:'+(await params).id);
 const response = await get(new NextRequest(url,{headers:req.headers})); if(!response.ok)return response;
 return NextResponse.json((await response.json()).comments,{headers:privateHeaders});
}
export async function POST(req: NextRequest, {params}: {params: Promise<{id:string}>}) {
 const body = await req.json().catch(() => ({}));
 return post(new NextRequest(new URL('/api/media/community',req.url),{method:'POST',headers:req.headers,body:JSON.stringify({action:'comment',key:'video:'+(await params).id,text:body.text})}));
}
