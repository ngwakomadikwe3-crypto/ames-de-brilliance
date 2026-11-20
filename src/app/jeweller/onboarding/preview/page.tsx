import AppAccountShell from '@/components/AppAccountShell';
import JewellerStudioPreview from '@/components/JewellerStudioPreview';
import Link from 'next/link';
export default function Page(){return <AppAccountShell title="After your business profile"><p className="mb-4">Next, upload identity and business registration evidence plus three portfolio images. Staff review the application before opening your studio.</p><JewellerStudioPreview direct/><Link href="/jeweller/onboarding" className="mt-5 inline-block underline">Return to your application</Link></AppAccountShell>}