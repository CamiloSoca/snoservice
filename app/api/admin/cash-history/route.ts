import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/session';
import { getSupabaseServer, SHOP_UUID } from '@/lib/supabase-server';

// Historial bajo demanda: no retrasa la carga inicial del administrador.
export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({error:'No autorizado.'}, {
      status:401, headers:{'Cache-Control':'private, no-store'},
    });
  }

  try {
    const {data, error} = await getSupabaseServer()
      .from('cash_registers')
      .select('id,status,opened_at,closed_at,initial_amount,total_sales,total_expenses,final_amount')
      .eq('shop_id', SHOP_UUID)
      .order('opened_at', {ascending:false})
      .limit(30);
    if (error) {
      console.error('No se pudo consultar el historial de caja:', error.code);
      return NextResponse.json({error:'No se pudo cargar el historial.'}, {status:500});
    }
    return NextResponse.json({registers: data || []}, {
      headers:{'Cache-Control':'private, no-store'},
    });
  } catch {
    return NextResponse.json({error:'No se pudo cargar el historial.'}, {status:500});
  }
}
