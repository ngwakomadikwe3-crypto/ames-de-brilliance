import {videoMedia} from '@/lib/video-media';
export async function GET(req:Request,context:{params:Promise<{id:string}>}){return videoMedia(req,(await context.params).id);}
