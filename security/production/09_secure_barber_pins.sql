-- Hasheo irreversible de PIN. Ejecutar después del código que usa verify_barber_pin_login.
-- Requiere pgcrypto en esquema extensions.
CREATE OR REPLACE FUNCTION public.hash_barber_pin_at_rest()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,extensions
AS $body$
BEGIN
  IF TG_OP='UPDATE' AND NEW.pin IS NOT DISTINCT FROM OLD.pin THEN
    RETURN NEW;
  END IF;
  IF NEW.pin IS NULL OR NEW.pin !~ '^[0-9]{4,6}$' OR NEW.pin='1234' THEN
    RAISE EXCEPTION 'Definí un PIN válido de 4 a 6 dígitos (distinto de 1234)'
      USING ERRCODE='23514';
  END IF;
  NEW.pin := extensions.crypt(NEW.pin, extensions.gen_salt('bf',10));
  RETURN NEW;
END;
$body$;

-- Migrar datos legados una sola vez; los antiguos PIN en claro dejan de existir.
UPDATE public.barbers SET pin=extensions.crypt(pin,extensions.gen_salt('bf',10))
 WHERE pin ~ '^[0-9]{4,6}$';
DO $check$
BEGIN
 IF EXISTS (SELECT 1 FROM public.barbers WHERE pin !~ '^\\$2[abxy]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}$') THEN
   RAISE EXCEPTION 'Existen PIN con formato inesperado. No se aplicó el cambio.';
 END IF;
END $check$;

DROP TRIGGER IF EXISTS trg_hash_barber_pin_at_rest ON public.barbers;
CREATE TRIGGER trg_hash_barber_pin_at_rest
BEFORE INSERT OR UPDATE OF pin ON public.barbers
FOR EACH ROW EXECUTE FUNCTION public.hash_barber_pin_at_rest();

CREATE OR REPLACE FUNCTION public.verify_barber_pin_login(
 p_shop_id uuid,p_barber_id uuid,p_pin text
) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,extensions
AS $body$
DECLARE v_hash text; v_attempts bigint;
BEGIN
 IF p_pin IS NULL OR p_pin !~ '^[0-9]{4,6}$' OR p_pin='1234' THEN RETURN 'invalid'; END IF;
 SELECT b.pin INTO v_hash FROM public.barbers b
 WHERE b.id=p_barber_id AND b.shop_id=p_shop_id AND b.active IS TRUE
 FOR UPDATE;
 IF NOT FOUND THEN RETURN 'invalid'; END IF;
 SELECT count(*) INTO v_attempts FROM public.audit_logs
 WHERE shop_id=p_shop_id AND action='PIN_FAILED'
 AND details=p_barber_id::text AND created_at>clock_timestamp()-interval '15 minutes';
 IF v_attempts>=5 THEN RETURN 'blocked'; END IF;
 IF v_hash=extensions.crypt(p_pin,v_hash) THEN RETURN 'ok'; END IF;
 INSERT INTO public.audit_logs(shop_id,action,details)
 VALUES(p_shop_id,'PIN_FAILED',p_barber_id::text);
 RETURN 'invalid';
END;
$body$;

REVOKE ALL ON FUNCTION public.hash_barber_pin_at_rest() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.verify_barber_pin_login(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verify_barber_pin_login(uuid,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.verify_barber_pin_secure(uuid,text) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';