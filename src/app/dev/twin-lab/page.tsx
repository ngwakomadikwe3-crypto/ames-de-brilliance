import { notFound } from 'next/navigation';
import TwinLabClient from './TwinLabClient';
export const metadata = { title: 'Twin lab', robots: { index: false, follow: false } };
// The morph-test screen for the face twin: available in development and on preview deployments, never in production.
export default function TwinLabPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return <TwinLabClient />;
}
