import { NextRequest } from 'next/server';
import { POST as post } from '@/app/api/media/community/route';
export async function POST(req: NextRequest, {params}: {params: Promise<{id:string}>}) {
 const body = await req.json().catch(() => ({})); const value = typeof body.liked === 'boolean' ? body.liked : body.delta === 1 ? true : body.delta === -1 ? false : null;
 return post(new NextRequest(new URL('/api/media/community', req.url), {method:'POST',headers:req.headers,body:JSON.stringify({action:'like',key:'video:'+(await params).id,value})}));
}
