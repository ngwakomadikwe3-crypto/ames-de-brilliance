import {cookies} from 'next/headers';
import {customerConfig} from '@/lib/customer/config.mjs';
import {createAppwriteGateway} from '@/lib/customer/appwrite.mjs';
import {createCustomerService} from '@/lib/customer/service.mjs';
import AdminConsole from './AdminConsole';
export const dynamic='force-dynamic';
export default async function AdminPage(){
 const cookie=(await cookies()).toString();
 const config=customerConfig();
 const response=await createCustomerService(config,createAppwriteGateway(config)).handle(new Request('https://ames.internal/api/customer/admin/events',{headers:{cookie}}));
 if(response.status===403)return <main style={{padding:40,fontFamily:'system-ui'}}>Forbidden</main>;
 if(!response.ok)return <main style={{padding:40,fontFamily:'system-ui'}}>Admin service unavailable</main>;
 const data=await response.json() as {events:Record<string,unknown>[]};
 return <AdminConsole events={data.events}/>;
}
