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
 if(!response.ok)return <main className={styles.shell}><Link className={styles.brand} href="/">AMES</Link><section className={styles.denied}><p className={styles.eyebrow}>Private workspace</p><h1>Jeweller access required</h1><p>{response.status===401?'Sign in with the AMES account linked to your verified jeweller application.':response.status===403?'This workspace is available only to verified jewellers.':'Portal service is temporarily unavailable.'}</p><Link href="/account">Go to account</Link></section></main>;
 const {profile}=await response.json();return <JewellerDashboard initialProfile={profile}/>;
}
