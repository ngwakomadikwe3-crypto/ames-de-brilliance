import {cookies} from 'next/headers';
import {customerConfig} from '@/lib/customer/config.mjs';
import {createAppwriteGateway} from '@/lib/customer/appwrite.mjs';
import {createCustomerService} from '@/lib/customer/service.mjs';
import styles from './admin.module.css';
import AdminConsole from './AdminConsole';
export const dynamic='force-dynamic';
export default async function AdminPage(){
 const cookie=(await cookies()).toString();
 let response:Response;
 let load:()=>Promise<Response>;
 try{const config=customerConfig();const service=createCustomerService(config,createAppwriteGateway(config));response=await service.handle(new Request(`${config.origin}/api/customer/admin/access`,{headers:{cookie}}));load=()=>service.handle(new Request(`${config.origin}/api/customer/admin/dashboard`,{headers:{cookie}}));}catch{return <main className={styles.shell}><h1>Admin dashboard unavailable</h1><p>Please try again shortly.</p><a href="/account">Go to account</a></main>;}
 const result=await response.json();
 if(!response.ok)return <main className={styles.shell}><section className={styles.panel}><a href="/app">AMES</a><h1>{response.status===401?'Sign in to access admin':response.status===403?'Admin access required':'Admin dashboard unavailable'}</h1><p>{response.status===401?'Sign in with your AMES administrator account. If your session expired, sign in again.':response.status===403?'You are signed in, but this account is missing the required amesadmin label. If access was just granted, sign out and sign in again.':result.reason==='ADMIN_DATA_UNAVAILABLE'?result.error:'Please try again shortly.'}</p><a href={response.status===401?'/login':'/account'}>{response.status===401?'Sign in':'Go to account'}</a></section></main>;
 // Authorization has succeeded. A data failure must not take away navigation.
 let initial=null;try{const data=await load();if(data.ok)initial=await data.json();}catch{/* The shell offers retry and independent sections. */}
 return <AdminConsole initial={initial}/>;
}
