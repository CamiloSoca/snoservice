-- STAGING ONLY. No ejecutar en produccion sin pruebas de extremo a extremo.
-- Aplica al esquema exacto del proyecto staging replicado desde produccion.
-- Requiere rama security/pre-launch con acceso a datos privados SOLO desde el servidor.
-- PostgreSQL revoca permisos directos de tabla y columna (incluidos grants heredados
-- via PUBLIC). service_role debe conservar bypassrls en Supabase.
BEGIN;

DO $$
DECLARE
  t text;
  c record;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'appointments','audit_logs','barbers','cash_registers','expenses',
    'manual_charges','services','shops','time_clock','tips'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', t
    );

    -- Un GRANT a nivel de columna puede sobrevivir a un REVOKE sobre la tabla.
    FOR c IN
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t
    LOOP
      EXECUTE format(
        'REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM PUBLIC, anon, authenticated',
        c.column_name, t
      );
    END LOOP;

    -- Retirar todas las politicas heredadas, no solo nombres conocidos:
    -- de lo contrario una politica PERMISSIVE adicional podria seguir dando acceso.
    FOR p IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- Columnas publicas minimas. No conceder shop_id: filtro RLS administrado por servidor.
GRANT SELECT (id, slug, name, role, bio, specialties, service_ids, active)
  ON public.barbers TO anon, authenticated;
CREATE POLICY security_public_barbers_read ON public.barbers
  FOR SELECT TO anon, authenticated
  USING (shop_id = '11111111-1111-1111-1111-111111111113'::uuid AND active IS TRUE);

GRANT SELECT (id, name, price, duration_minutes, description, image_url, active)
  ON public.services TO anon, authenticated;
CREATE POLICY security_public_services_read ON public.services
  FOR SELECT TO anon, authenticated
  USING (shop_id = '11111111-1111-1111-1111-111111111113'::uuid AND active IS TRUE);

GRANT SELECT (id, name, phone, address, city, logo_url,
              background_image_url, cover_image_url, schedule)
  ON public.shops TO anon, authenticated;
CREATE POLICY security_public_shops_read ON public.shops
  FOR SELECT TO anon, authenticated
  USING (id = '11111111-1111-1111-1111-111111111113'::uuid);

-- Cerrar RPC legadas. Operaciones sensibles pasan por API con sesion.
-- validate_appointment_booking es una funcion TRIGGER: la revocacion de EXECUTE
-- a roles publicos no impide que PostgreSQL la ejecute desde su trigger.
REVOKE ALL PRIVILEGES ON FUNCTION public.admin_unblock_barber_pin(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.verify_barber_pin_secure(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.cancel_appointment_by_client(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.cancel_appointment_by_client_email(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.validate_appointment_booking()
  FROM PUBLIC, anon, authenticated;

COMMIT;

-- Pendiente tras aplicar SOLO en STAGING:
-- (1) verificar con anon SIN sesion que PIN/comisiones, turnos y finanzas no se leen.
-- (2) comprobar RPCs anon rechazadas (no basta con revisar pg_policies).
-- (3) verificar reservas/admin/barbero/caja con URLs y claves de staging.
-- (4) revisar otros roles o funciones con permisos indirectos.
-- (5) proteger reservas concurrentes con mecanismo transaccional antes del lanzamiento.
