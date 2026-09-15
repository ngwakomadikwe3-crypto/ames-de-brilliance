import {cookies} from 'next/headers';
import Link from 'next/link';
import {customerConfig} from '@/lib/customer/config.mjs';
import {createAppwriteGateway} from '@/lib/customer/appwrite.mjs';
import {createCustomerService} from '@/lib/customer/service.mjs';
import JewellerDashboard from './JewellerDashboard';
import styles from './portal.module.css';
export const dynamic='force-dynamic';
export default async function JewellerPortal(){
 const cookie=(await cookies()).toString();let response:Response;
 try{const config=customerConfig();response=await createCustomerService(config,createAppwriteGateway(config)).handle(new Request(`${config.origin}/api/customer/jewellers/profile`,{headers:{cookie}}));}catch{return <main className={styles.shell}><Link href="/">AMES</Link><h1>Jeweller workspace</h1><p>Portal service is temporarily unavailable.</p></main>;}
 if(!response.ok){const denial=await response.json();const title=response.status===401?'Sign in to your jeweller account':denial.reason==='APPLICATION_NOT_FOUND'?'No linked application':denial.reason==='APPLIED'?'Application received':denial.reason==='UNDER_REVIEW'?'Application under review':denial.reason==='REJECTED'?'Application not approved':denial.reason==='SUSPENDED'?'Jeweller access suspended':response.status===403?'Verification required':'Jeweller portal unavailable';return <main className={styles.shell}><Link className={styles.brand} href="/app">AMES</Link><section className={styles.denied}><h1>{title}</h1><p>{[401,403].includes(response.status)||denial.reason==='JEWELLER_DATA_UNAVAILABLE'?denial.error:'Please try again shortly.'}</p><Link href={response.status===401?'/login':'/account'}>{response.status===401?'Sign in':'Go to account'}</Link>{denial.reason==='APPLICATION_NOT_FOUND'&&<p><Link href="/jewellers/apply">Apply as a jeweller</Link></p>}</section></main>;}
 const {profile}=await response.json();return <JewellerDashboard initialProfile={profile}/>;
}
