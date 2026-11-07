"use client";

import { useState } from 'react';
import { chunkUpload } from '@/lib/chunk-upload';

type ThreeD = { status: string; scan: { name: string; bytes: number; complete: boolean } | null; approved: boolean };
const STATUS: Record<string, string> = { none: 'No 3D yet', scan_uploaded: 'Scan received — HOUSEofAMES will convert it to 3D', converting: 'Being converted to 3D', awaiting_approval: '3D made, waiting for approval', approved: '3D shown in the Catalogue Room', withdrawn: '3D withdrawn' };

/** Dealer portal: upload a 3D scan of one stone (Sarine, Helium or any scanner's STL, OBJ, PLY, GLB, FBX or 3DM export). */
export default function TraderScanUpload({ code, stoneId, threeD }: { code: string; stoneId: string; threeD?: ThreeD }) {
  const [state, setState] = useState<ThreeD | undefined>(threeD), [file, setFile] = useState<File | null>(null), [progress, setProgress] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function upload() {
    if (!file) return; setBusy(true); setError('');
    try {
      const base = `/api/trader/${encodeURIComponent(code)}/stones/${encodeURIComponent(stoneId)}/scan`;
      const last = await chunkUpload(file, file.name, f => ({ url: base, method: 'POST', body: f }), i => `${base}?part=${i}`, p => setProgress(`Uploading… ${p}%`));
      setState(last.threeD); setFile(null); setProgress('Scan uploaded.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); setProgress(''); }
    finally { setBusy(false); }
  }
  return <div className="p-3 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} onClick={e => e.stopPropagation()}>
    <div className="text-[10px] uppercase tracking-wider font-light" style={{ color: '#A6A6AB' }}>3D for the Catalogue Room</div>
    <div className="text-[11px]" style={{ color: '#EAE8E4' }}>{STATUS[state?.status || 'none'] || state?.status}{state?.scan ? ` · ${state.scan.name}${state.scan.complete ? '' : ' (unfinished)'}` : ''}</div>
    <div className="text-[10px]" style={{ color: '#A6A6AB' }}>Upload the stone’s scanner file (STL, OBJ, PLY, GLB, FBX or 3DM, up to 80 MB) for an exact 3D. Without one, polished stones are shown from their shape and measurements and rough stones from the photo.</div>
    <input type="file" accept=".stl,.obj,.ply,.glb,.gltf,.fbx,.3dm" disabled={busy} onChange={e => setFile(e.target.files?.[0] || null)} className="block w-full text-[11px]" style={{ color: '#EAE8E4' }} />
    <button type="button" disabled={busy || !file} onClick={upload} className="text-[11px] px-3 py-1.5 disabled:opacity-40" style={{ border: '1px solid rgba(255,255,255,0.2)', color: '#EAE8E4' }}>{state?.scan ? 'Replace 3D scan' : 'Upload 3D scan'}</button>
    {progress && <div role="status" className="text-[10px]" style={{ color: '#A6A6AB' }}>{progress}</div>}
    {error && <div role="alert" className="text-[10px]" style={{ color: '#FCA5A5' }}>{error}</div>}
  </div>;
}
