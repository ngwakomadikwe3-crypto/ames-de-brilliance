import { notFound } from 'next/navigation';
import AppAccountShell from '@/components/AppAccountShell';
import MakerStorefront from '@/components/MakerStorefront';
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; if (!/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(slug)) notFound();
  return <AppAccountShell title="Jeweller storefront"><MakerStorefront slug={slug} /></AppAccountShell>;
}
