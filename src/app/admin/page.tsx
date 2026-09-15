import {cookies} from 'next/headers';
import {customerConfig} from '@/lib/customer/config.mjs';
import {createAppwriteGateway} from '@/lib/customer/appwrite.mjs';
import {createCustomerService} from '@/lib/customer/service.mjs';
import AdminConsole from './AdminConsole';
export const dynamic='force-dynamic';
export default async function AdminPage(){
 const cookie=(await cookies()).toString();
 const config=customerConfig();
 const service=createCustomerService(config,createAppwriteGateway(config));
 const response=await service.handle(new Request(`${config.origin}/api/customer/admin/dashboard`,{headers:{cookie}}));
 if([401,403].includes(response.status))return <main style={{padding:40}}>Administrator access required.</main>;
 if(!response.ok)return <main style={{padding:40}}>Admin service unavailable.</main>;
 return <AdminConsole initial={await response.json()}/>;
}
