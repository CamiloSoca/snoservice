-- PREPARADO PARA PRODUCCIÓN, NO EJECUTADO. Requiere revisión y ensayo en clon.
-- Reemplaza solamente la función del trigger
-- trg_validate_appointment_booking; no actualiza ni borra reservas existentes.
-- Producción actualmente usa validate_booking_flexible() en INSERT/UPDATE.
-- El cambio de trigger es atómico dentro de esta transacción.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.validate_appointment_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $body$
DECLARE
  v_phone text;
  v_service public.services%ROWTYPE;
  v_barber public.barbers%ROWTYPE;
  v_schedule jsonb;
  v_rule jsonb;
  v_today date := (clock_timestamp() AT TIME ZONE 'America/Montevideo')::date;
  v_day date;
  v_start time;
  v_open time;
  v_close time;
  v_weekdays text[] := ARRAY['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  v_months text[] := ARRAY['Ene','Feb','Mar','Abr','May','Jun',
                            'Jul','Ago','Sep','Oct','Nov','Dic'];
  v_keys text[] := ARRAY['domingo','lunes','martes','miercoles',
                          'jueves','viernes','sabado'];
  v_label text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'confirmado' THEN
    RAISE EXCEPTION 'Una reserva nueva debe estar confirmada' USING ERRCODE='23514';
  END IF;
  IF NEW.shop_id IS NULL OR NEW.service_id IS NULL OR NEW.barber_id IS NULL THEN
    RAISE EXCEPTION 'Local, servicio y barbero son obligatorios' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_service FROM public.services
  WHERE id=NEW.service_id AND shop_id=NEW.shop_id AND active IS TRUE
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Servicio no disponible en este local' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_barber FROM public.barbers
  WHERE id=NEW.barber_id AND shop_id=NEW.shop_id AND active IS TRUE
  FOR SHARE;
  IF NOT FOUND OR
     (cardinality(v_barber.service_ids)>0 AND
      NOT NEW.service_id::text=ANY(v_barber.service_ids)) THEN
    RAISE EXCEPTION 'Barbero no disponible para este servicio' USING ERRCODE='23514';
  END IF;
  IF NEW.price_snapshot IS DISTINCT FROM v_service.price OR
     NEW.duration_minutes IS DISTINCT FROM v_service.duration_minutes OR
     v_service.price < 0 OR v_service.duration_minutes NOT BETWEEN 15 AND 720 THEN
    RAISE EXCEPTION 'Precio o duración no coinciden con el servicio' USING ERRCODE='23514';
  END IF;

  SELECT schedule INTO v_schedule FROM public.shops WHERE id=NEW.shop_id FOR SHARE;
  IF NOT FOUND OR v_schedule IS NULL THEN
    RAISE EXCEPTION 'Horario del local no disponible' USING ERRCODE='23514';
  END IF;
  IF NEW.time_slot !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RAISE EXCEPTION 'Hora de reserva inválida' USING ERRCODE='23514';
  END IF;
  v_start := NEW.time_slot::time;
  FOR v_day IN SELECT (v_today + n)::date FROM generate_series(0,29) AS days(n) LOOP
    v_label := v_weekdays[EXTRACT(DOW FROM v_day)::int+1] || ' ' ||
      EXTRACT(DAY FROM v_day)::int || ' ' || v_months[EXTRACT(MONTH FROM v_day)::int];
    EXIT WHEN v_label=NEW.date_string;
  END LOOP;
  IF v_label IS DISTINCT FROM NEW.date_string THEN
    RAISE EXCEPTION 'Fecha fuera de la agenda de 30 días' USING ERRCODE='23514';
  END IF;
  IF (v_day + v_start) AT TIME ZONE 'America/Montevideo' <= clock_timestamp() THEN
    RAISE EXCEPTION 'El horario ya comenzó o pasó' USING ERRCODE='23514';
  END IF;
  v_rule := v_schedule -> v_keys[EXTRACT(DOW FROM v_day)::int+1];
  IF v_rule IS NULL OR v_rule->>'isOpen' IS DISTINCT FROM 'true' OR
     COALESCE(v_rule->>'openTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR
     COALESCE(v_rule->>'closeTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RAISE EXCEPTION 'El local está cerrado o el horario no es válido' USING ERRCODE='23514';
  END IF;
  v_open := (v_rule->>'openTime')::time;
  v_close := (v_rule->>'closeTime')::time;
  IF v_start<v_open OR v_start + v_service.duration_minutes * interval '1 minute'>v_close OR
     (EXTRACT(EPOCH FROM (v_start-v_open))::int/60)%30<>0 THEN
    RAISE EXCEPTION 'El servicio no cabe en el horario comercial' USING ERRCODE='23514';
  END IF;

  IF length(btrim(NEW.client_name))<3 OR
     COALESCE(NEW.client_email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Nombre y correo válidos son obligatorios' USING ERRCODE='23514';
  END IF;

  v_phone := regexp_replace(COALESCE(NEW.client_phone,''), '\D','','g');
  IF v_phone !~ '^09[1-9][0-9]{6}$' OR
     substring(v_phone from 4 for 6) ~ '^([0-9])\1{5}$' OR
     substring(v_phone from 4 for 6) IN ('123456','654321','012345') THEN
    RAISE EXCEPTION 'Celular uruguayo inválido' USING ERRCODE='23514';
  END IF;
  NEW.client_phone := substring(v_phone from 1 for 3) || ' ' ||
                      substring(v_phone from 4 for 3) || ' ' ||
                      substring(v_phone from 7 for 3);
  IF EXISTS (SELECT 1 FROM public.appointments a
    WHERE a.shop_id=NEW.shop_id AND a.date_string=NEW.date_string
      AND regexp_replace(a.client_phone,'\D','','g')=v_phone
      AND a.status IS DISTINCT FROM 'cancelado') THEN
    RAISE EXCEPTION 'Este celular ya tiene un turno activo ese día' USING ERRCODE='23514';
  END IF;
  IF (SELECT count(*) FROM public.appointments a
      WHERE a.shop_id=NEW.shop_id AND a.created_at>clock_timestamp()-interval '1 minute')>=4 THEN
    RAISE EXCEPTION 'Demasiadas reservas recientes; intentá más tarde' USING ERRCODE='23514';
  END IF;
  -- El constraint EXCLUDE GiST appointments_no_active_overlap es la defensa
  -- transaccional contra concurrencia; una consulta previa no lo sustituye.
  RETURN NEW;
END;
$body$;

REVOKE ALL ON FUNCTION public.validate_appointment_booking() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_appointment_booking() TO service_role;
DROP TRIGGER IF EXISTS trg_validate_appointment_booking ON public.appointments;
CREATE TRIGGER trg_validate_appointment_booking
BEFORE INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.validate_appointment_booking();
COMMIT;
