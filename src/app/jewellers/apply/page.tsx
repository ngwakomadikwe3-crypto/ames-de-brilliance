import Link from 'next/link';
import JewellerApplicationForm from './JewellerApplicationForm';

export const metadata={title:'Apply to join AMES | Jewellers'};
export default function JewellerApplyPage(){return <main className="min-h-screen bg-[#0d1115] text-[#f0ede7] px-5 py-12"><div className="mx-auto max-w-3xl"><Link href="/" className="text-xs tracking-[.24em] text-[#b9aa84]">AMES DE BRILLIANTE</Link><p className="mt-14 text-xs uppercase tracking-[.22em] text-[#b9aa84]">Private jeweller network</p><h1 className="mt-3 text-4xl font-light">Apply to work with AMES</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-[#aeb5bc]">Tell us what your business can support. Leaving an optional answer unknown is better than estimating it. Applications are reviewed privately and do not require inventory.</p><JewellerApplicationForm/></div></main>}
