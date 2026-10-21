-- Preflight de producción. SOLO CONSULTAS: la transacción es READ ONLY.
-- Ejecutar exclusivamente contra la base mgrggoyraetgfjwjbuts.
\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '20s';

SELECT 'SERVIDOR' AS chequeo, current_database() AS base, current_user AS usuario;

SELECT 'NEGOCIOS' AS chequeo, id AS shop_id, name AS nombre
FROM public.shops ORDER BY id;

SELECT 'appointments' AS tabla, COUNT(*) AS filas FROM public.appointments
UNION ALL SELECT 'barbers', COUNT(*) FROM public.barbers
UNION ALL SELECT 'services', COUNT(*) FROM public.services
UNION ALL SELECT 'expenses', COUNT(*) FROM public.expenses
UNION ALL SELECT 'tips', COUNT(*) FROM public.tips
UNION ALL SELECT 'manual_charges', COUNT(*) FROM public.manual_charges
UNION ALL SELECT 'cash_registers', COUNT(*) FROM public.cash_registers
UNION ALL SELECT 'audit_logs', COUNT(*) FROM public.audit_logs
UNION ALL SELECT 'time_clock', COUNT(*) FROM public.time_clock
UNION ALL SELECT 'shops', COUNT(*) FROM public.shops
ORDER BY tabla;

SELECT 'CAJAS_ABIERTAS' AS chequeo, shop_id, COUNT(*) AS cantidad
FROM public.cash_registers WHERE status = 'abierta'
GROUP BY shop_id ORDER BY shop_id;

SELECT 'RLS' AS chequeo, tablename, rowsecurity
FROM pg_tables WHERE schemaname='public'
  AND tablename IN ('appointments','audit_logs','barbers','cash_registers',
    'expenses','manual_charges','services','shops','time_clock','tips')
ORDER BY tablename;

SELECT 'POLITICAS' AS chequeo, tablename, policyname, roles, cmd
FROM pg_policies WHERE schemaname='public'
  AND tablename IN ('appointments','audit_logs','barbers','cash_registers',
    'expenses','manual_charges','services','shops','time_clock','tips')
ORDER BY tablename, policyname;

SELECT 'FUNCIONES' AS chequeo, p.proname AS funcion,
  pg_get_function_identity_arguments(p.oid) AS argumentos,
  p.prosecdef AS security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS ejecutable_por_anon
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prokind='f'
ORDER BY p.proname;

SELECT 'TRIGGERS_RESERVAS' AS chequeo, tgname, pg_get_triggerdef(oid) AS definicion
FROM pg_trigger WHERE tgrelid='public.appointments'::regclass
AND NOT tgisinternal ORDER BY tgname;

SELECT 'RESERVAS_MISMO_HORARIO' AS chequeo, shop_id, barber_id,
  date_string, time_slot, COUNT(*) AS cantidad
FROM public.appointments
WHERE status IS DISTINCT FROM 'cancelado'
GROUP BY shop_id, barber_id, date_string, time_slot
HAVING COUNT(*) > 1
ORDER BY cantidad DESC
LIMIT 10;

COMMIT;
