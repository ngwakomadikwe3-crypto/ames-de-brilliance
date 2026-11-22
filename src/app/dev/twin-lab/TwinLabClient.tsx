'use client';
import dynamic from 'next/dynamic';
const TwinLab = dynamic(() => import('@/components/TwinLab'), { ssr: false });
export default function TwinLabClient() { return <TwinLab />; }
