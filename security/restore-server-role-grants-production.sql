-- Reparacion de permisos de SERVIDOR en produccion tras endurecimiento RLS.
-- Ejecutar EXCLUSIVAMENTE contra Supabase mgrggoyraetgfjwjbuts.
-- SOLO GRANT a service_role sobre las 10 tablas; no altera filas ni desactiva RLS.
-- NO concede permisos a anon, authenticated ni PUBLIC.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.shops) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM public.shops
       WHERE id = '11111111-1111-1111-1111-111111111113'::uuid
     ) THEN
    RAISE EXCEPTION 'ABORTADO: los negocios de produccion no coinciden con los esperados.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls
  ) THEN
    RAISE EXCEPTION 'ABORTADO: service_role no existe o no tiene BYPASSRLS.';
  END IF;
END $$;

-- Diagnostico ANTES de restaurar el acceso de backend.
SELECT c.relname AS tabla, 
  has_table_privilege('service_role', c.oid, 'SELECT') AS select_antes,
  has_table_privilege('service_role', c.oid, 'INSERT') AS insert_antes
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN (
    'appointments','audit_logs','barbers','cash_registers','expenses',
    'manual_charges','services','shops','time_clock','tips'
  ) AND c.relkind IN ('r','p')
ORDER BY c.relname;

-- El rol privilegiado del backend necesita permisos SQL explicitos, incluso si
-- tiene BYPASSRLS. La politica restrictiva para anon permanece intacta.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE
  public.appointments,
  public.audit_logs,
  public.barbers,
  public.cash_registers,
  public.expenses,
  public.manual_charges,
  public.services,
  public.shops,
  public.time_clock,
  public.tips
  TO service_role;

-- Validar DENTRO de la misma transaccion, abortando si falla un grant.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'appointments','audit_logs','barbers','cash_registers','expenses',
    'manual_charges','services','shops','time_clock','tips'
  ] LOOP
    IF NOT has_table_privilege('service_role', format('public.%I',t), 'SELECT')
       OR NOT has_table_privilege('service_role', format('public.%I',t), 'INSERT')
       OR NOT has_table_privilege('service_role', format('public.%I',t), 'UPDATE')
       OR NOT has_table_privilege('service_role', format('public.%I',t), 'DELETE') THEN
      RAISE EXCEPTION 'ABORTADO: falta permiso de service_role en %', t;
    END IF;
  END LOOP;
END $$;

COMMIT;
-- Verificar por API web tras aplicar; si persiste permission denied,
-- revisar que SUPABASE_SERVICE_ROLE_KEY en Vercel Production sea service_role
-- para el mismo Supabase (NO imprimir ni compartir su valor).
