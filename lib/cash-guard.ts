// Guardrail común para las escrituras de caja (API administrativa y del barbero).
// Cerrar la caja no debe depender de deshabilitar botones en el navegador.
import { NextResponse } from 'next/server';
import { getSupabaseServer, SHOP_UUID } from '@/lib/supabase-server';

export async function getCashOpenState(): Promise<'open' | 'closed' | 'multiple' | 'error'> {
  const {data, error} = await getSupabaseServer()
    .from('cash_registers')
    .select('id')
    .eq('shop_id', SHOP_UUID)
    .eq('status', 'abierta')
    .limit(2);

  if (error) {
    console.error('Error consultando estado de caja:', error.code);
    return 'error';
  }
  if (data?.length === 1) return 'open';
  if (data?.length && data.length > 1) return 'multiple';
  return 'closed';
}

export async function requireOpenCash(): Promise<NextResponse | null> {
  const state = await getCashOpenState();
  if (state === 'open') return null;
  if (state === 'error') {
    return NextResponse.json({error: 'No se pudo comprobar el estado de la caja.'}, {status: 503});
  }
  if (state === 'multiple') {
    return NextResponse.json({error: 'Hay cajas abiertas duplicadas. Debe revisarlas el administrador.'}, {status: 409});
  }
  return NextResponse.json(
    {error: 'La caja está cerrada. Abrila antes de registrar o modificar movimientos financieros.'},
    {status: 409}
  );
}
