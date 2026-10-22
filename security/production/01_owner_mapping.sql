-- PREPARADO PARA PRODUCCIÓN, NO EJECUTADO.
-- Usar psql -v OWNER_BARBER_IDS='uuid[,uuid...]' tras verificar quiénes
-- son realmente propietarios. Nunca inferirlo de role o commission_rate.
\set ON_ERROR_STOP on
\if :{?OWNER_BARBER_IDS}
\else
\echo 'Falta OWNER_BARBER_IDS confirmado por el negocio.'
\quit 1
\endif
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE public.barbers ADD COLUMN IF NOT EXISTS is_owner boolean;
SELECT set_config('sno.owner_ids', :'OWNER_BARBER_IDS', true) \gset
DO $map$
DECLARE ids uuid[] := string_to_array(current_setting('sno.owner_ids'),',')::uuid[];
BEGIN
  IF cardinality(ids)<1 OR
     (SELECT count(*) FROM public.barbers WHERE id=ANY(ids))<>cardinality(ids) THEN
    RAISE EXCEPTION 'La lista de propietarios contiene un ID desconocido o repetido';
  END IF;
  IF EXISTS (SELECT 1 FROM public.barbers
      WHERE is_owner IS NOT NULL AND is_owner IS DISTINCT FROM (id=ANY(ids))) THEN
    RAISE EXCEPTION 'Clasificación previa distinta; revisar manualmente';
  END IF;
  UPDATE public.barbers SET is_owner=(id=ANY(ids)) WHERE is_owner IS NULL;
  IF EXISTS (SELECT 1 FROM public.barbers WHERE is_owner IS NULL) THEN
    RAISE EXCEPTION 'Quedó un barbero sin clasificar';
  END IF;
END;
$map$;
COMMIT;
