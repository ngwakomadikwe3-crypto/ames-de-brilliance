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
 const [response,jewellersResponse,inventoryResponse]=await Promise.all([service.handle(new Request(`${config.origin}/api/customer/admin/events`,{headers:{cookie}})),service.handle(new Request(`${config.origin}/api/customer/admin/jewellers`,{headers:{cookie}})),service.handle(new Request(`${config.origin}/api/customer/admin/inventory`,{headers:{cookie}}))]);
 if(response.status===403||jewellersResponse.status===403)return <main style={{padding:40,fontFamily:'system-ui'}}>Forbidden</main>;
 if(!response.ok||!jewellersResponse.ok||!inventoryResponse.ok)return <main style={{padding:40,fontFamily:'system-ui'}}>Admin service unavailable</main>;
 const data=await response.json() as {events:Record<string,unknown>[]};const jewellers=await jewellersResponse.json() as {applications:Record<string,unknown>[]};const inventory=await inventoryResponse.json() as {items:Record<string,unknown>[]};
 return <AdminConsole events={data.events} applications={jewellers.applications} inventory={inventory.items}/>;
}
