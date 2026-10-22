-- PREPARADO PARA PRODUCCIÓN, NO EJECUTADO. Ejecutar después de 01..07.
\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='20s';
SELECT 'owners_mapped' check_name,
  count(*) FILTER (WHERE is_owner IS TRUE) AS expected_positive,
  count(*) FILTER (WHERE is_owner IS NULL) AS expected_zero
FROM public.barbers;
SELECT 'active_overlaps_constraint' check_name,
  count(*) AS expected_one FROM pg_constraint
WHERE conrelid='public.appointments'::regclass
  AND conname='appointments_no_active_overlap';
SELECT 'one_open_cash_index' check_name,count(*) AS expected_one
FROM pg_indexes WHERE schemaname='public' AND tablename='cash_registers'
  AND indexname='cash_registers_one_open_per_shop';
SELECT 'booking_and_transition_triggers' check_name,tgname,
  pg_get_triggerdef(oid) AS definition
FROM pg_trigger WHERE tgrelid='public.appointments'::regclass
  AND tgname IN ('trg_validate_appointment_booking','trg_guard_appointment_transition')
ORDER BY tgname;
SELECT 'rpc_permissions' check_name,proname,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_must_be_false,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS server_must_be_true
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
  ('admin_bootstrap_snapshot','barber_bootstrap_snapshot','public_shop_snapshot');
SELECT 'row_counts' check_name,'appointments' entity,count(*) FROM public.appointments
UNION ALL SELECT 'row_counts','cash_registers',count(*) FROM public.cash_registers
UNION ALL SELECT 'row_counts','manual_charges',count(*) FROM public.manual_charges
UNION ALL SELECT 'row_counts','tips',count(*) FROM public.tips
UNION ALL SELECT 'row_counts','expenses',count(*) FROM public.expenses;
COMMIT;
