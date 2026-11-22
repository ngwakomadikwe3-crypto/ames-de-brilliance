import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import AppAccountShell from '@/components/AppAccountShell';
import CollectionView from '@/components/CollectionView';
import { COLLECTIONS, collectionById } from '@/lib/collections';

export function generateStaticParams() { return COLLECTIONS.map(c => ({ id: c.id })); }
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const c = collectionById((await params).id);
  return c ? { title: `${c.name} · Collection · HOUSEofAMES`, description: c.description } : {};
}
/** A collection, shareable: /collections/the-house-suite, /collections/the-everyday-suite. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const entry = collectionById((await params).id);
  if (!entry) notFound();
  return <AppAccountShell title={entry.name}><CollectionView entry={entry} /></AppAccountShell>;
}
