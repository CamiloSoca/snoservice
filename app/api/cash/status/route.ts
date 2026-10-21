import { NextResponse } from 'next/server';
import { getBarberSession, requireAdminSession } from '@/lib/session';
import { getCashOpenState } from '@/lib/cash-guard';

export async function GET() {
  const [admin, barber] = await Promise.all([requireAdminSession(), getBarberSession()]);
  if (!admin && !barber) return NextResponse.json({error: 'No autorizado.'}, {status: 401});

  const state = await getCashOpenState();
  if (state === 'error') return NextResponse.json({error: 'No se pudo consultar el estado de caja.'}, {status: 503});
  if (state === 'multiple') return NextResponse.json({error: 'Se detectaron varias cajas abiertas.'}, {status: 409});
  return NextResponse.json({open: state === 'open'}, {headers: {'Cache-Control': 'no-store'}});
}
