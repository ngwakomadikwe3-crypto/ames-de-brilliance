import {cookies} from 'next/headers';
import Link from 'next/link';
import {customerConfig} from '@/lib/customer/config.mjs';
import {createAppwriteGateway} from '@/lib/customer/appwrite.mjs';
import {createCustomerService} from '@/lib/customer/service.mjs';
export const dynamic='force-dynamic';
function Shell({children}:{children:React.ReactNode}){return <main className="min-h-screen bg-[#0d1115] px-5 py-12 text-[#f0ede7]"><div className="mx-auto max-w-4xl"><Link href="/" className="text-xs tracking-[.24em] text-[#b9aa84]">AMES DE BRILLIANTE</Link><div className="mt-16">{children}</div></div></main>}
export default async function JewellerPortal(){
 const cookie=(await cookies()).toString();let response:Response;
 try{const config=customerConfig();response=await createCustomerService(config,createAppwriteGateway(config)).handle(new Request(`${config.origin}/api/customer/jewellers/me`,{headers:{cookie}}));}catch{return <Shell><p>Portal service is temporarily unavailable.</p></Shell>}
 if(response.status===401)return <Shell><h1 className="text-3xl font-light">Jeweller portal</h1><p className="mt-4 text-[#aeb5bc]">Sign in with the AMES account using the email on your application, then return here.</p><Link className="mt-7 inline-block bg-[#b9aa84] px-5 py-3 text-sm text-[#11161b]" href="/account">AMES account sign in</Link></Shell>;
 if(response.status===404)return <Shell><h1 className="text-3xl font-light">No linked application</h1><p className="mt-4 text-[#aeb5bc]">We could not find an application matching your signed-in email.</p><Link className="mt-7 inline-block underline" href="/jewellers/apply">Apply to join</Link></Shell>;
 if(!response.ok)return <Shell><p>Portal service is temporarily unavailable.</p></Shell>;
 const {application}=await response.json();return <Shell><p className="text-xs uppercase tracking-[.2em] text-[#b9aa84]">Private workspace</p><h1 className="mt-3 text-3xl font-light">{application.businessName}</h1><p className="mt-3 text-sm text-[#aeb5bc]">Verification status: <strong className="text-[#f0ede7]">{application.verificationStatus}</strong></p><div className="mt-10 grid gap-4 sm:grid-cols-2">{['Profile management','Inventory uploads','Sourcing leads','Response status','Quote submission','Analytics'].map(v=><div key={v} className="border border-white/10 p-5"><h2>{v}</h2><p className="mt-2 text-xs text-[#8f979f]">Coming in a future portal release.</p></div>)}</div></Shell>
}
