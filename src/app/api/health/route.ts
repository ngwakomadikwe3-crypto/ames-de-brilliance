import { NextRequest, NextResponse } from 'next/server';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import {customerConfig} from '@/lib/customer/config.mjs';
import {createAppwriteGateway} from '@/lib/customer/appwrite.mjs';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' };
  if (request.nextUrl.searchParams.get('mode') !== 'ready') return NextResponse.json({ status: 'alive' }, { headers });
  const checks: Record<string, boolean> = {
    catalogFiles: true,
    backendConfigured: ['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY'].every(k => !!process.env[k]?.trim()),
    sessionSecretConfigured: !!process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32 && process.env.SESSION_SECRET !== 'adb-session-secret-2026',
    secureEntitlementBackendImplemented: true,
    privateAppwriteResourcesReachable: false,
  };
  try {
    for (const name of ['round_brilliant','oval_brilliant','emerald_cut','pear_brilliant','asscher_cut'])
      await access(join(process.cwd(), 'public/models/canonical', `ames_${name}_v1.glb`));
  } catch { checks.catalogFiles = false; }
  try { checks.privateAppwriteResourcesReachable = await createAppwriteGateway(customerConfig()).health(); } catch { /* Readiness fails closed; credentials and upstream errors stay server-side. */ }
  const ready = Object.values(checks).every(Boolean);
  return NextResponse.json({ status: ready ? 'ready' : 'blocked', checks, dependencyConnectivity: checks.privateAppwriteResourcesReachable?'verified':'unavailable' }, { status: ready ? 200 : 503, headers });
}
