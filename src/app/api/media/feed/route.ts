import {NextResponse} from 'next/server';
import {mediaFeed} from '@/lib/customer-media';
export const runtime='nodejs';
export async function GET(){try{return NextResponse.json(await mediaFeed(),{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'Media is temporarily unavailable.'},{status:503});}}
