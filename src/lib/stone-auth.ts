import { NextResponse } from 'next/server';
import { getSessionRole } from '@/lib/staff-session';

/** Inventory staff access is separate from owner-only auction publication. */
export function stoneWriteGuard(request: Request, ownerOnly = false): NextResponse | null {
  const role = getSessionRole(request.headers.get('cookie') || undefined);
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (role !== 'owner' && (ownerOnly || role !== 'cousin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== new URL(request.url).origin)) {
    return NextResponse.json({ error: 'Cross-origin write rejected' }, { status: 403 });
  }
  return null;
}
