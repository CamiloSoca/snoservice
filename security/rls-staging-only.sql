-- BORRADOR PARA STAGING. NO EJECUTAR EN PRODUCCION SIN RESPALDO Y PRUEBAS.
-- Depende de que la aplicación use SOLO las API seguras de security/pre-launch.
-- Este archivo NO se despliega ni ejecuta automáticamente en Supabase.
--
-- Los nombres de políticas se obtuvieron de la consulta pg_policies del 20/10/2026.
-- Revisar tablas, permisos y funciones RPC antes de usar.
BEGIN;

-- Conserva filas y columnas: solo modifica permisos y políticas.
DO $$
DECLARE
  t text;
  c record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'appointments','barbers','cash_registers','expenses',
    'manual_charges','services','shops','tips'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', t
    );
    -- También elimina cualquier permiso preexistente a nivel de columna.
    FOR c IN
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t
    LOOP
      EXECUTE format(
        'REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM PUBLIC, anon, authenticated',
        c.column_name, t
      );
    END LOOP;
  END LOOP;
END $$;

-- Cerrar por completo acceso público a turnos.
DROP POLICY IF EXISTS "Acceso barberia appointments" ON public.appointments;
DROP POLICY IF EXISTS "Turnos de la tienda" ON public.appointments;
DROP POLICY IF EXISTS "allow_public_insert_appointments" ON public.appointments;
-- Se conserva allow_all_service_role_appointments.

DROP POLICY IF EXISTS "Acceso barberia barbers" ON public.barbers;
DROP POLICY IF EXISTS "Permitir todo administracion y publica barberos" ON public.barbers;

DROP POLICY IF EXISTS "Acceso barberia cash_registers" ON public.cash_registers;
DROP POLICY IF EXISTS "Permitir todo acceso público en cash_registers" ON public.cash_registers;

DROP POLICY IF EXISTS "Acceso barberia expenses" ON public.expenses;
DROP POLICY IF EXISTS "Gastos de la tienda" ON public.expenses;

DROP POLICY IF EXISTS "Acceso barberia manual_charges" ON public.manual_charges;
DROP POLICY IF EXISTS "Permitir todo acceso público en manual_charges" ON public.manual_charges;

DROP POLICY IF EXISTS "Acceso barberia tips" ON public.tips;
DROP POLICY IF EXISTS "Permitir todo a tips por shop_id" ON public.tips;
DROP POLICY IF EXISTS "Permitir todo acceso público en tips" ON public.tips;

DROP POLICY IF EXISTS "Acceso barberia services" ON public.services;
DROP POLICY IF EXISTS "Servicios públicos y admin" ON public.services;
DROP POLICY IF EXISTS "services_public_select" ON public.services;

DROP POLICY IF EXISTS "Acceso barberia shops" ON public.shops;
DROP POLICY IF EXISTS "Shop de la tienda" ON public.shops;
DROP POLICY IF EXISTS "shops_public_select" ON public.shops;

-- Conceder únicamente SELECT de columnas públicas (nunca PIN o comisiones).
GRANT SELECT (id, slug, name, role, bio, specialties, service_ids, active)
  ON public.barbers TO anon, authenticated;
CREATE POLICY "security_public_barbers_read" ON public.barbers
  FOR SELECT TO anon, authenticated
  USING (shop_id = '11111111-1111-1111-1111-111111111113'::uuid AND active = true);

GRANT SELECT (id, name, price, duration_minutes, description, image_url, active)
  ON public.services TO anon, authenticated;
CREATE POLICY "security_public_services_read" ON public.services
  FOR SELECT TO anon, authenticated
  USING (shop_id = '11111111-1111-1111-1111-111111111113'::uuid AND active = true);

GRANT SELECT (id, name, phone, address, city, logo_url,
              background_image_url, cover_image_url, schedule)
  ON public.shops TO anon, authenticated;
CREATE POLICY "security_public_shops_read" ON public.shops
  FOR SELECT TO anon, authenticated
  USING (id = '11111111-1111-1111-1111-111111111113'::uuid);

-- No hay GRANT ni POLICY públicos para appointments, expenses,
-- cash_registers, tips o manual_charges.
COMMIT;

-- Fuera de la transacción, revisar funciones RPC SECURITY DEFINER,
-- EXECUTE a PUBLIC/anon y concesiones de otros roles personalizados.
-- NO ejecutar sin analizar las llamadas del frontend y probar en STAGING.
