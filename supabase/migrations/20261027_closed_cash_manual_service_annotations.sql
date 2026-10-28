-- Tipos de servicios de una caja ya cerrada sin modificar ni desbloquear los cobros originales.
-- Esta tabla es solo de anotación de servicio, no contiene dinero ni altera el cierre.
CREATE TABLE IF NOT EXISTS public.manual_charge_service_annotations (
  charge_id uuid PRIMARY KEY REFERENCES public.manual_charges(id) ON DELETE RESTRICT,
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  service_id uuid NOT NULL REFERENCES public.services(id),
  service_name_snapshot text NOT NULL CHECK(length(service_name_snapshot) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.manual_charge_service_annotations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manual_charge_service_annotations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.manual_charge_service_annotations TO service_role;

-- Se permite corregir el nombre de cuatro trabajos identificados por el dueño.
-- Coincidencia exacta de UUID, nombre, importe, forma de pago, barbería y barbero.
-- Las filas de manual_charges no se editan. Un servicio equivale a un trabajo.
WITH confirmed(id,note,amount,payment_method,service_id,service_name) AS (
  VALUES
    ('6ac12d1e-1e91-479d-ad4a-5ca4b9a8f189'::uuid,'cliente julio berni'::text,400::numeric,'cash'::text,'94455fac-f8c6-41de-9dbd-41de989fe771'::uuid,'Corte'::text),
    ('03b0bffe-ab31-4127-b49a-9de3dcf7e741'::uuid,'Maxi Arevalo'::text,400::numeric,'transfer'::text,'94455fac-f8c6-41de-9dbd-41de989fe771'::uuid,'Corte'::text),
    ('73ea3eaa-af44-4941-a766-e1e1f7422af9'::uuid,'Alejandro'::text,500::numeric,'transfer'::text,'b160b6e7-6647-412b-bd81-53bde6d44604'::uuid,'Corte y Barba'::text),
    ('c369c5f0-2942-45a7-99cf-4bc93e86fe55'::uuid,'Mechas'::text,1200::numeric,'transfer'::text,'be6f9b84-4618-43f4-b45f-5e6533b4e46c'::uuid,'Mechas'::text)
)
INSERT INTO public.manual_charge_service_annotations (charge_id,shop_id,service_id,service_name_snapshot)
SELECT m.id,m.shop_id,confirmed.service_id,confirmed.service_name
FROM confirmed
JOIN public.manual_charges m ON m.id=confirmed.id AND m.note=confirmed.note
  AND m.amount=confirmed.amount AND m.payment_method=confirmed.payment_method
  AND m.shop_id='11111111-1111-1111-1111-111111111113'::uuid
  AND m.service_id IS NULL AND m.service_name_snapshot IS NULL
JOIN public.barbers b ON b.id=m.barber_id AND b.shop_id=m.shop_id AND b.name='Nahuel'
JOIN public.services s ON s.id=confirmed.service_id AND s.shop_id=m.shop_id AND s.name=confirmed.service_name
ON CONFLICT (charge_id) DO NOTHING;

-- Las rutas rápidas de bootstrap aplican la anotación solo si el cobro
-- original carece de categoría. Esto no altera un importe ni una comisión.

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
          coalesce(c.service_id, a.service_id) AS service_id,
          coalesce(c.service_name_snapshot, a.service_name_snapshot) AS service_name_snapshot,
          CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object('name', b.name)
          END AS barbers
        FROM public.manual_charges c
        LEFT JOIN public.manual_charge_service_annotations a ON a.charge_id = c.id AND a.shop_id = c.shop_id
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
        SELECT m.id, m.barber_id, m.amount, m.note, m.date_string, m.created_at,
          m.commission_rate_snapshot, m.barber_earnings_snapshot,
          m.business_earnings_snapshot, m.cash_register_id,
          m.created_by_role, m.created_by_barber_id,
          coalesce(m.service_id, a.service_id) AS service_id,
          coalesce(m.service_name_snapshot, a.service_name_snapshot) AS service_name_snapshot
        FROM public.manual_charges m
        LEFT JOIN public.manual_charge_service_annotations a ON a.charge_id = m.id AND a.shop_id = m.shop_id
        WHERE m.shop_id = p_shop_id AND m.barber_id = p_barber_id
        ORDER BY m.created_at DESC
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
