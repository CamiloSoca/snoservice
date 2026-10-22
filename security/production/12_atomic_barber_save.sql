-- Guardado atómico de barberos sin reenviar un hash como PIN de alta.
-- Invocable exclusivamente por service_role desde API autenticada.
BEGIN;
SET LOCAL statement_timeout='30s';

CREATE OR REPLACE FUNCTION public.save_barbers_secure(
 p_shop_id uuid, p_entries jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public
AS $body$
DECLARE
  v_entry jsonb;
  v_id uuid;
  v_existing_shop uuid;
  v_pin text;
  v_services text[];
  v_specialties text[];
  v_rate numeric;
BEGIN
  IF p_shop_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.shops WHERE id=p_shop_id) THEN
    RAISE EXCEPTION 'Local inexistente' USING ERRCODE='23514';
  END IF;
  IF p_entries IS NULL OR jsonb_typeof(p_entries)<>'array'
    OR jsonb_array_length(p_entries)>100 THEN
    RAISE EXCEPTION 'Lista de barberos inválida' USING ERRCODE='23514';
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_entries) AS t(value) LOOP
    v_id := (v_entry->>'id')::uuid;
    v_pin := NULLIF(btrim(COALESCE(v_entry->>'pin','')),'');
    v_rate := (v_entry->>'commission_rate')::numeric;
    IF v_id IS NULL OR btrim(COALESCE(v_entry->>'name',''))=''
      OR v_rate IS NULL OR v_rate<0 OR v_rate>100 THEN
      RAISE EXCEPTION 'Datos de barbero inválidos' USING ERRCODE='23514';
    END IF;
    IF v_pin IS NOT NULL AND (v_pin !~ '^[0-9]{4,6}$' OR v_pin='1234') THEN
      RAISE EXCEPTION 'El PIN nuevo debe tener de 4 a 6 dígitos'
        USING ERRCODE='23514';
    END IF;

    SELECT COALESCE(array_agg(value),'{}'::text[])
      INTO v_services
      FROM jsonb_array_elements_text(COALESCE(v_entry->'service_ids','[]'::jsonb)) AS t(value);
    SELECT COALESCE(array_agg(value),'{}'::text[])
      INTO v_specialties
      FROM jsonb_array_elements_text(COALESCE(v_entry->'specialties','[]'::jsonb)) AS t(value);

    IF EXISTS (
      SELECT 1 FROM unnest(v_services) AS requested(service_id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.services s
        WHERE s.shop_id=p_shop_id AND s.id::text=requested.service_id
      )
    ) THEN
      RAISE EXCEPTION 'Un servicio no pertenece al local'
        USING ERRCODE='23514';
    END IF;

    SELECT shop_id INTO v_existing_shop FROM public.barbers WHERE id=v_id FOR UPDATE;
    IF FOUND THEN
      IF v_existing_shop IS DISTINCT FROM p_shop_id THEN
        RAISE EXCEPTION 'El barbero pertenece a otro local' USING ERRCODE='42501';
      END IF;
      UPDATE public.barbers SET
        slug=v_entry->>'slug',
        name=v_entry->>'name',
        role=v_entry->>'role',
        bio=v_entry->>'bio',
        specialties=v_specialties,
        service_ids=v_services,
        commission_rate=v_rate,
        is_owner=COALESCE((v_entry->>'is_owner')::boolean,false),
        active=COALESCE((v_entry->>'active')::boolean,true),
        pin=COALESCE(v_pin,pin)
      WHERE id=v_id AND shop_id=p_shop_id;
    ELSE
      IF v_pin IS NULL THEN
        RAISE EXCEPTION 'Los barberos nuevos necesitan un PIN' USING ERRCODE='23514';
      END IF;
      INSERT INTO public.barbers(
        id,shop_id,slug,name,role,bio,specialties,service_ids,
        commission_rate,is_owner,active,pin
      ) VALUES(
        v_id,p_shop_id,v_entry->>'slug',v_entry->>'name',
        v_entry->>'role',v_entry->>'bio',v_specialties,v_services,
        v_rate,COALESCE((v_entry->>'is_owner')::boolean,false),
        COALESCE((v_entry->>'active')::boolean,true),v_pin
      );
    END IF;
  END LOOP;
END;
$body$;

REVOKE ALL ON FUNCTION public.save_barbers_secure(uuid,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_barbers_secure(uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
