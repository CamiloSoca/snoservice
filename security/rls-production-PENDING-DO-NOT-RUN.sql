-- MIGRACION PROPUESTA PARA PRODUCCION: PENDIENTE DE PRECHECK Y APROBACION.
-- NO ejecutar antes de verificar respaldo, ID del negocio, estado de Vercel,
-- triggers/RPC y que el codigo nuevo esta listo para publicarse.
-- No modifica datos (sin INSERT, UPDATE, DELETE, TRUNCATE ni DROP TABLE).
-- ATENCION: cambia GRANTs, RLS y politicas existentes de las 10 tablas.
-- Ejecutar SOLO contra el proyecto Supabase mgrggoyraetgfjwjbuts.
-- Esta politica se limita a UNA barberia actual; si hay otras tiendas, aborta.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Guardas para impedir aplicar restricciones de staging a otra base.
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.shops) <> 1 OR
     (SELECT COUNT(*) FROM public.shops
      WHERE id = '11111111-1111-1111-1111-111111111113'::uuid) <> 1 THEN
    RAISE EXCEPTION 'ABORTAR: el negocio de produccion no coincide con el UUID esperado o existen varios negocios';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.cash_registers
    WHERE status = 'abierta' AND shop_id IS NOT NULL
    GROUP BY shop_id HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'ABORTAR: hay multiples cajas abiertas para el mismo negocio';
  END IF;
END $$;

-- Proteccion transaccional ante dos aperturas concurrentes de caja.
-- IF NOT EXISTS: la restriccion ya aplicada no se duplica.
CREATE UNIQUE INDEX IF NOT EXISTS cash_registers_one_open_per_shop
  ON public.cash_registers (shop_id)
  WHERE status = 'abierta';

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

-- Columnas publicas minimas. shop_id es necesario para filtros .eq('shop_id') del frontend.
-- El UUID no es secreto; RLS sigue restringiendo filas al negocio permitido.
GRANT SELECT (id, shop_id, slug, name, role, bio, specialties, service_ids, active)
  ON public.barbers TO anon, authenticated;
CREATE POLICY security_public_barbers_read ON public.barbers
  FOR SELECT TO anon, authenticated
  USING (shop_id = '11111111-1111-1111-1111-111111111113'::uuid AND active IS TRUE);

GRANT SELECT (id, shop_id, name, price, duration_minutes, description, image_url, active)
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

-- Cualquier error anterior hace ROLLBACK de todos los cambios.
COMMIT;

-- Verificaciones posteriores:
-- - Respetar cuentas: anon no puede leer appointments, expenses, tips o PINs.
-- - service_role sigue pudiendo administrar todos los datos mediante APIs.
-- - reservas, cancelacion, logins y caja con el codigo security/pre-launch.
-- - no regresar a codigo antiguo sin restaurar primero los permisos.
