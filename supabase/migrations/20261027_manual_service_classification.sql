-- Clasificación manual aditiva: sin cambios en comisiones ni reservas.
ALTER TABLE public.manual_charges
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_name_snapshot text;
CREATE OR REPLACE FUNCTION public.admin_bootstrap_snapshot(p_shop_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'appointments',
    coalesce((
      SELECT jsonb_agg(to_jsonb(ap))
      FROM (
        SELECT a.id, a.code, a.service_id, a.barber_id, a.date_string,
          a.time_slot, a.duration_minutes, a.status, a.created_at,
          a.client_name, a.client_phone, a.client_email, a.client_notes,
          a.price_snapshot, a.completed_at,
          a.commission_rate_snapshot, a.barber_earnings_snapshot,
          a.business_earnings_snapshot, a.completed_cash_register_id,
          CASE WHEN sv.id IS NULL THEN NULL ELSE jsonb_build_object(
            'name', sv.name, 'price', sv.price,
            'duration_minutes', sv.duration_minutes
          ) END AS services,
          CASE WHEN ba.id IS NULL THEN NULL ELSE jsonb_build_object('name', ba.name)
          END AS barbers
        FROM public.appointments a
        LEFT JOIN public.services sv ON sv.id = a.service_id
        LEFT JOIN public.barbers ba ON ba.id = a.barber_id
        WHERE a.shop_id = p_shop_id
        ORDER BY a.created_at DESC
      ) ap
    ), '[]'::jsonb),
    'services',
    coalesce((
      SELECT jsonb_agg(to_jsonb(s))
      FROM (
        SELECT id, name, price, duration_minutes, description, image_url, active
        FROM public.services WHERE shop_id = p_shop_id
      ) s
    ), '[]'::jsonb),
    'barbers',
    coalesce((
      SELECT jsonb_agg(to_jsonb(b))
      FROM (SELECT id,slug,name,role,bio,specialties,service_ids,active,
                   commission_rate,is_owner,image_url,working_schedule
            FROM public.barbers WHERE shop_id = p_shop_id) b
    ), '[]'::jsonb),
    'expenses',
    coalesce((
      SELECT jsonb_agg(to_jsonb(e))
      FROM (
        SELECT id, description, amount, category, expense_date, created_at
        FROM public.expenses WHERE shop_id = p_shop_id
        ORDER BY expense_date DESC
      ) e
    ), '[]'::jsonb),
    'tips',
    coalesce((
      SELECT jsonb_agg(to_jsonb(t))
      FROM (
        SELECT t.id, t.barber_id, t.amount, t.note, t.date_string, t.created_at,
          t.cash_register_id,
          CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object('name', b.name)
          END AS barbers
        FROM public.tips t
        LEFT JOIN public.barbers b ON b.id = t.barber_id
        WHERE t.shop_id = p_shop_id
        ORDER BY t.created_at DESC
      ) t
    ), '[]'::jsonb),
    'manualCharges',
    coalesce((
      SELECT jsonb_agg(to_jsonb(c))
      FROM (
        SELECT c.id, c.barber_id, c.amount, c.note, c.date_string, c.created_at,
          c.commission_rate_snapshot, c.barber_earnings_snapshot,
          c.business_earnings_snapshot, c.cash_register_id,
          c.created_by_role, c.created_by_barber_id,
          c.service_id, c.service_name_snapshot,
          CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object('name', b.name)
          END AS barbers
        FROM public.manual_charges c
        LEFT JOIN public.barbers b ON b.id = c.barber_id
        WHERE c.shop_id = p_shop_id
        ORDER BY c.created_at DESC
      ) c
    ), '[]'::jsonb),
    'shop',
    (
      SELECT to_jsonb(sh) FROM (
        SELECT id, name, phone, address, city, logo_url,
          background_image_url, cover_image_url, schedule
        FROM public.shops WHERE id = p_shop_id
        LIMIT 1
      ) sh
    ),
    'cashRegisters',
    coalesce((
      SELECT jsonb_agg(to_jsonb(c)) FROM (
        SELECT id, status, closed_at, opened_at
        FROM public.cash_registers
        WHERE shop_id = p_shop_id
        ORDER BY opened_at DESC LIMIT 1
      ) c
    ), '[]'::jsonb)
  );
$function$;

CREATE OR REPLACE FUNCTION public.barber_bootstrap_snapshot(p_shop_id uuid, p_barber_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
          business_earnings_snapshot, cash_register_id,
          created_by_role, created_by_barber_id,
          service_id, service_name_snapshot
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
$function$;
