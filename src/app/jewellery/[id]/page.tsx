import { notFound } from 'next/navigation';
import AppAccountShell from '@/components/AppAccountShell';
import PublicJewelleryDetails from '@/components/PublicJewelleryDetails';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!/^[a-f0-9-]{36}$/.test(id)) notFound();
  return <AppAccountShell title="Jewellery"><PublicJewelleryDetails id={id} /></AppAccountShell>;
}
