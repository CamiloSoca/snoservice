import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/session';
import { getInstagramConnectionStatus } from '@/lib/instagram-server';

export async function GET() {
  if (!await requireAdminSession()) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  try {
    return NextResponse.json(await getInstagramConnectionStatus(),
      { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ configured: false, connected: false, username: null },
      { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
