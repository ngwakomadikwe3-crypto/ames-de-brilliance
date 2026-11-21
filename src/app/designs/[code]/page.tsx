import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import AppAccountShell from '@/components/AppAccountShell';
import { DesignDetail } from '@/components/CustomDesigns';
import { CUSTOM_DESIGNS, designByCode } from '@/lib/custom-designs';

export function generateStaticParams() { return CUSTOM_DESIGNS.map(d => ({ code: d.code.toLowerCase() })); }

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const design = designByCode((await params).code);
  if (!design) return {};
  return { title: `${design.name} · Made to order · HOUSEofAMES`, description: design.summary,
    openGraph: design.images.front ? { images: [{ url: design.images.front.src, width: design.images.front.width, height: design.images.front.height, alt: design.alt.front }] } : undefined };
}

/** One custom-order design, shareable by its code: /designs/w1 … /designs/e2. */
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const design = designByCode((await params).code);
  if (!design) notFound();
  return <AppAccountShell title={design.name}><DesignDetail design={design} /></AppAccountShell>;
}
