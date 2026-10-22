import {NextResponse} from 'next/server';
import {getSupabaseServer, SHOP_UUID} from '@/lib/supabase-server';
import {requireAdminSession, getBarberSession} from '@/lib/session';

// La señal se consulta frecuentemente, pero solo lee UNA columna de UNA fila.
// No devuelve turnos, nombres, contactos ni detalles financieros.
export async function GET() {
  const headers = {'Cache-Control': 'private, no-store'};
  const admin = await requireAdminSession();
  const barber = admin ? null : await getBarberSession();
  if (!admin && !barber) {
    return NextResponse.json({error:'No autorizado.'}, {status:401, headers});
  }

  try {
    const {data, error} = await getSupabaseServer().from('shops')
      .select('agenda_revision').eq('id', SHOP_UUID).single();
    if (error || !data) {
      return NextResponse.json({error:'No se pudo comprobar la agenda.'}, {status:503, headers});
    }
    return NextResponse.json({revision:Number(data.agenda_revision) || 0}, {headers});
  } catch {
    return NextResponse.json({error:'Error verificando agenda.'}, {status:503, headers});
  }
}
