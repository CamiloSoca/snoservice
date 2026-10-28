// La caja cerrada es inmutable. Las anotaciones clasifican servicios
// históricos sin editar los cobros, comisiones, propinas ni arqueos originales.
// Solo se usa detrás de las APIs privadas con sesión validada.
import {getSupabaseServer, SHOP_UUID} from '@/lib/supabase-server';

type ManualRow = {
  id: string;
  service_id?: string | null;
  service_name_snapshot?: string | null;
};

export async function resolveManualServiceAnnotations<T extends ManualRow>(
  rows: T[], db: ReturnType<typeof getSupabaseServer>,
): Promise<T[]> {
  const missing = rows.filter(row => !row.service_name_snapshot).map(row => row.id);
  if (missing.length === 0) return rows;
  // El índice por charge_id impide duplicados y esta consulta no agrega ingresos.
  const {data, error} = await db.from('manual_charge_service_annotations')
    .select('charge_id,service_id,service_name_snapshot')
    .eq('shop_id',SHOP_UUID).in('charge_id',missing);
  if (error) throw new Error('No se pudieron recuperar las clasificaciones de servicios manuales.');
  const annotations = new Map((data||[]).map(item => [item.charge_id,item]));
  return rows.map(row => {
    if (row.service_name_snapshot) return row;
    const annotation = annotations.get(row.id);
    return annotation ? {
      ...row,
      service_id: row.service_id || annotation.service_id,
      service_name_snapshot: annotation.service_name_snapshot,
    } : row;
  });
}
