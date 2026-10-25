-- Corrige el guardado de horarios sin configurar. JSON 'null' no es SQL NULL:
-- si no se normaliza, la CHECK falla y el barbero queda inhabilitado.
DO $migration$
DECLARE
 fn text;
 old_update text := 'working_schedule=CASE WHEN v_entry ? ''working_schedule'' THEN v_entry->''working_schedule'' ELSE working_schedule END,';
 new_update text := 'working_schedule=CASE WHEN v_entry ? ''working_schedule'' THEN NULLIF(v_entry->''working_schedule'',''null''::jsonb) ELSE working_schedule END,';
 old_insert text := ',v_pin,v_entry->''working_schedule''';
 new_insert text := ',v_pin,NULLIF(v_entry->''working_schedule'',''null''::jsonb)';
BEGIN
 SELECT pg_get_functiondef('public.save_barbers_secure(uuid,jsonb)'::regprocedure) INTO fn;
 IF fn IS NULL OR strpos(fn, old_update)=0 OR strpos(fn, old_insert)=0 THEN
   RAISE EXCEPTION 'La función save_barbers_secure cambió; no se puede migrar automáticamente';
 END IF;
 fn := replace(fn, old_update, new_update);
 fn := replace(fn, old_insert, new_insert);
 EXECUTE fn;
END
$migration$;
UPDATE public.barbers SET working_schedule=NULL
WHERE working_schedule='null'::jsonb;
