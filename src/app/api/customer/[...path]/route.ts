import { customerConfig } from '@/lib/customer/config.mjs';
import { createAppwriteGateway } from '@/lib/customer/appwrite.mjs';
import { createCustomerService } from '@/lib/customer/service.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function handle(request:Request){try{const config=customerConfig();return await createCustomerService(config,createAppwriteGateway(config)).handle(request);}catch{return Response.json({error:'Customer service is not configured'},{status:503,headers:{'Cache-Control':'no-store'}});}}
export {handle as GET,handle as POST,handle as PUT,handle as DELETE};
