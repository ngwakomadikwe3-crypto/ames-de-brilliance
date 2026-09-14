import Link from 'next/link';
import JewellerApplicationForm from './JewellerApplicationForm';

export const metadata={title:'Apply to join AMES | Jewellers'};
export default function JewellerApplyPage(){return <main className="ames-jeweller-apply min-h-screen bg-[#0d1115] px-5 py-10 text-white sm:px-8 sm:py-14"><div className="mx-auto max-w-3xl"><Link href="/" className="apply-wordmark text-[10px] !font-normal tracking-[.32em] text-[#d8dde3]">AMES</Link><p className="apply-kicker mt-20 text-[10px] !font-light uppercase tracking-[.3em] text-[#9ca5ae] sm:mt-28">Private jeweller network</p><h1 className="apply-title mt-5 max-w-2xl font-serif text-[2.75rem] leading-[.96] tracking-[-.035em] text-white sm:text-[4.5rem]">Apply to work with AMES</h1><p className="apply-intro mt-7 max-w-xl text-[13px] !font-light leading-7 text-[#aeb6bf] sm:mt-9 sm:text-sm">Tell us what your business can support. Leaving an optional answer unknown is better than estimating it. Applications are reviewed privately and do not require inventory.</p><JewellerApplicationForm/></div></main>}

