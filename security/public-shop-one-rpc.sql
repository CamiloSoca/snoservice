-- SNOSERVICE: catalogo publico en una sola ida al servidor de datos.
-- La API de Next publica solamente campos permitidos; la funcion no
-- permite acceso desde la clave anon de Supabase.

CREATE OR REPLACE FUNCTION public.public_shop_snapshot(p_shop_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'shop', (
      SELECT to_jsonb(sh) FROM (
        SELECT id, name, phone, address, city, logo_url,
          background_image_url, cover_image_url, schedule
        FROM public.shops WHERE id = p_shop_id LIMIT 1
      ) sh
    ),
    'services',
    coalesce((
      SELECT jsonb_agg(to_jsonb(s)) FROM (
        SELECT id, name, price, duration_minutes, description, image_url, active
        FROM public.services WHERE shop_id = p_shop_id AND active IS TRUE
      ) s
    ), '[]'::jsonb),
    'barbers',
    coalesce((
      SELECT jsonb_agg(to_jsonb(b)) FROM (
        SELECT id, slug, name, role, bio, specialties, service_ids, active
        FROM public.barbers WHERE shop_id = p_shop_id AND active IS TRUE
      ) b
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.public_shop_snapshot(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_shop_snapshot(uuid)
  TO service_role;
NOTIFY pgrst, 'reload schema';
