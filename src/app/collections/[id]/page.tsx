import { notFound } from 'next/navigation';

// Collections are removed from the app (23 Nov 2026): every /collections/<id> link is a 404.
export function generateStaticParams() { return [] as { id: string }[]; }

export default function Page() { notFound(); }
