-- Exclusivamente lectura sobre producción; ninguna escritura.
\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='20s';

SELECT 'PIN_DEFAULT' AS prueba,
       COUNT(*) FILTER (WHERE COALESCE(pin,'') = '1234') AS barberos_pin_inicial_1234,
       COUNT(*) FILTER (WHERE pin IS NULL OR pin !~ '^[0-9]{4,6}$') AS barberos_pin_formato_invalido,
       COUNT(*) AS total_barberos
FROM public.barbers
WHERE shop_id = '11111111-1111-1111-1111-111111111113'::uuid;

SELECT 'INDICES_RESERVAS' AS prueba, indexname, indexdef
FROM pg_indexes WHERE schemaname='public' AND tablename='appointments'
ORDER BY indexname;

SELECT 'FUNCION_VALIDACION_RESERVAS' AS prueba,
       pg_get_functiondef('public.validate_appointment_booking()'::regprocedure) AS codigo
;

SELECT 'COLUMNAS_CONFIGURACION' AS prueba, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name='shops'
  AND column_name IN ('id','admin_user','admin_pass','name','schedule')
ORDER BY column_name;

COMMIT;
