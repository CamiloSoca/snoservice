-- SNOSERVICE: una sola consulta de datos privados por sesion de barbero.
-- Ruta /api/barber/bootstrap valida cookie firmada antes del RPC.
-- SECURITY INVOKER: sin elevacion de privilegios. Solo service_role.

CREATE OR REPLACE FUNCTION public.barber_bootstrap_snapshot(
  p_shop_id uuid, p_barber_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'barber', (
      SELECT to_jsonb(b)
      FROM (
        SELECT id, name, active, commission_rate, is_owner
        FROM public.barbers
        WHERE shop_id = p_shop_id AND id = p_barber_id
        LIMIT 1
      ) b
    ),
    'appointments',
    coalesce((
      SELECT jsonb_agg(to_jsonb(a))
      FROM (
        SELECT a.id, a.code, a.service_id, a.barber_id, a.date_string,
          a.time_slot, a.duration_minutes, a.client_name, a.client_phone,
          a.client_email, a.client_notes, a.price_snapshot, a.status,
          a.created_at, a.completed_at, a.commission_rate_snapshot,
          a.barber_earnings_snapshot, a.business_earnings_snapshot,
          a.completed_cash_register_id,
          CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
            'name', s.name, 'price', s.price,
            'duration_minutes', s.duration_minutes
          ) END AS services,
          CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object('name', b.name)
          END AS barbers
        FROM public.appointments a
        LEFT JOIN public.services s ON s.id = a.service_id
        LEFT JOIN public.barbers b ON b.id = a.barber_id
        WHERE a.shop_id = p_shop_id AND a.barber_id = p_barber_id
        ORDER BY a.created_at DESC
      ) a
    ), '[]'::jsonb),
    'tips',
    coalesce((
      SELECT jsonb_agg(to_jsonb(t))
      FROM (
        SELECT id, barber_id, amount, note, date_string, created_at, cash_register_id
        FROM public.tips
        WHERE shop_id = p_shop_id AND barber_id = p_barber_id
        ORDER BY created_at DESC
      ) t
    ), '[]'::jsonb),
    'charges',
    coalesce((
      SELECT jsonb_agg(to_jsonb(c))
      FROM (
        SELECT id, barber_id, amount, note, date_string, created_at,
          commission_rate_snapshot, barber_earnings_snapshot,
          business_earnings_snapshot, cash_register_id
        FROM public.manual_charges
        WHERE shop_id = p_shop_id AND barber_id = p_barber_id
        ORDER BY created_at DESC
      ) c
    ), '[]'::jsonb),
    'cash',
    coalesce((
      SELECT jsonb_agg(to_jsonb(c))
      FROM (
        SELECT id FROM public.cash_registers
        WHERE shop_id = p_shop_id AND status = 'abierta'
        LIMIT 2
      ) c
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.barber_bootstrap_snapshot(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.barber_bootstrap_snapshot(uuid, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
