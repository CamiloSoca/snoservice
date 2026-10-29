-- 13 CUT: new bookings begin at HH:00, with zero overlap.
-- Additive guards: no existing appointment, fixed booking, cash entry or history is rewritten.
-- Existing fixed slots at HH:30 remain as-is, including completed/cancelled/courtesy operations.
-- Existing flexible validators remain installed; these guards are stricter on NEW schedules.

BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';

CREATE OR REPLACE FUNCTION public.guard_new_hourly_appointment()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public
AS $function$
DECLARE
  d date;
  day_key text;
  shop_hours jsonb;
  own_hours jsonb;
  shop_rule jsonb;
  worker_rule jsonb;
  close_time time;
BEGIN
  -- Only INSERT: completion, cancellation and accounting transitions of
  -- existing bookings remain governed by their original rules.
  IF NEW.time_slot IS NULL OR NEW.time_slot !~ '^([01][0-9]|2[0-3]):00$' THEN
    RAISE EXCEPTION 'Las reservas nuevas comienzan a la hora en punto'
      USING ERRCODE='23514';
  END IF;

  -- Same advisory lock as the existing common/fixed-booking validators,
  -- including when two customers reserve concurrently.
  PERFORM pg_advisory_xact_lock(hashtextextended('13cut-fixed-oneway:' || NEW.shop_id::text,0));

  d:=public.booking_date_from_label(NEW.date_string);
  IF d IS NULL THEN
    RAISE EXCEPTION 'Fecha de reserva inválida' USING ERRCODE='23514';
  END IF;
  day_key:=(ARRAY['domingo','lunes','martes','miercoles','jueves','viernes','sabado'])
    [extract(dow from d)::int+1];
  SELECT schedule INTO shop_hours FROM public.shops WHERE id=NEW.shop_id;
  SELECT working_schedule INTO own_hours FROM public.barbers
    WHERE id=NEW.barber_id AND shop_id=NEW.shop_id;
  shop_rule:=shop_hours->day_key;
  worker_rule:=own_hours->day_key;
  IF shop_rule IS NULL OR shop_rule->>'isOpen' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Barbería cerrada' USING ERRCODE='23514';
  END IF;
  close_time:=(shop_rule->>'closeTime')::time;
  IF own_hours IS NOT NULL THEN
    IF worker_rule IS NULL OR worker_rule->>'isOpen' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Barbero no disponible' USING ERRCODE='23514';
    END IF;
    close_time:=least(close_time,(worker_rule->>'closeTime')::time);
  END IF;
  IF NEW.time_slot::time + NEW.duration_minutes * interval '1 minute'>close_time THEN
    RAISE EXCEPTION 'El servicio debe terminar antes del cierre' USING ERRCODE='23514';
  END IF;

  -- All earlier reservations are read only; their real saved intervals
  -- occupy the agenda even when they start at HH:30.
  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.shop_id=NEW.shop_id AND a.barber_id=NEW.barber_id
      AND a.date_string=NEW.date_string AND a.status IS DISTINCT FROM 'cancelado'
      AND NEW.time_slot::time < a.time_slot::time + a.duration_minutes * interval '1 minute'
      AND a.time_slot::time < NEW.time_slot::time + NEW.duration_minutes * interval '1 minute'
  ) THEN
    RAISE EXCEPTION 'Horario ocupado por una reserva anterior' USING ERRCODE='23P01';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.fixed_bookings f
    WHERE f.shop_id=NEW.shop_id AND f.barber_id=NEW.barber_id
      AND f.active AND f.weekday=extract(dow from d)::int
      AND d BETWEEN f.start_date AND coalesce(f.end_date,'infinity'::date)
      AND d <> ALL(f.skipped_dates)
      AND NEW.time_slot::time < f.time_slot::time + f.duration_minutes * interval '1 minute'
      AND f.time_slot::time < NEW.time_slot::time + NEW.duration_minutes * interval '1 minute'
  ) THEN
    RAISE EXCEPTION 'Horario ocupado por un turno fijo' USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_aaa_hourly_new_appointment ON public.appointments;
CREATE TRIGGER trg_aaa_hourly_new_appointment
BEFORE INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.guard_new_hourly_appointment();

CREATE OR REPLACE FUNCTION public.guard_new_hourly_fixed_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public
AS $function$
DECLARE
  shop_hours jsonb;
  own_hours jsonb;
  shop_rule jsonb;
  worker_rule jsonb;
  day_key text;
  close_time time;
BEGIN
  -- Grandfather existing fixed schedules. Changing their notes, courtesy,
  -- date skips, activation or contact information must not move them.
  IF TG_OP='UPDATE'
     AND NEW.shop_id IS NOT DISTINCT FROM OLD.shop_id
     AND NEW.barber_id IS NOT DISTINCT FROM OLD.barber_id
     AND NEW.service_id IS NOT DISTINCT FROM OLD.service_id
     AND NEW.weekday IS NOT DISTINCT FROM OLD.weekday
     AND NEW.time_slot IS NOT DISTINCT FROM OLD.time_slot
     AND NEW.duration_minutes IS NOT DISTINCT FROM OLD.duration_minutes
     AND NEW.start_date IS NOT DISTINCT FROM OLD.start_date
     AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date THEN
    RETURN NEW;
  END IF;
  IF NOT NEW.active THEN RETURN NEW; END IF;
  IF NEW.time_slot IS NULL OR NEW.time_slot !~ '^([01][0-9]|2[0-3]):00$' THEN
    RAISE EXCEPTION 'Los turnos fijos nuevos comienzan a la hora en punto'
      USING ERRCODE='23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('13cut-fixed-oneway:' || NEW.shop_id::text,0));
  day_key:=(ARRAY['domingo','lunes','martes','miercoles','jueves','viernes','sabado'])[NEW.weekday+1];
  SELECT schedule INTO shop_hours FROM public.shops WHERE id=NEW.shop_id;
  SELECT working_schedule INTO own_hours FROM public.barbers
    WHERE id=NEW.barber_id AND shop_id=NEW.shop_id;
  shop_rule:=shop_hours->day_key;
  worker_rule:=own_hours->day_key;
  IF shop_rule IS NULL OR shop_rule->>'isOpen' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Barbería cerrada' USING ERRCODE='23514';
  END IF;
  close_time:=(shop_rule->>'closeTime')::time;
  IF own_hours IS NOT NULL THEN
    IF worker_rule IS NULL OR worker_rule->>'isOpen' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Barbero no disponible' USING ERRCODE='23514';
    END IF;
    close_time:=least(close_time,(worker_rule->>'closeTime')::time);
  END IF;
  IF NEW.time_slot::time + NEW.duration_minutes * interval '1 minute'>close_time THEN
    RAISE EXCEPTION 'El turno fijo debe terminar antes del cierre' USING ERRCODE='23514';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.fixed_bookings f
    WHERE f.id<>NEW.id AND f.shop_id=NEW.shop_id AND f.barber_id=NEW.barber_id
      AND f.active AND f.weekday=NEW.weekday
      AND f.start_date<=coalesce(NEW.end_date,'infinity'::date)
      AND NEW.start_date<=coalesce(f.end_date,'infinity'::date)
      AND NEW.time_slot::time < f.time_slot::time + f.duration_minutes * interval '1 minute'
      AND f.time_slot::time < NEW.time_slot::time + NEW.duration_minutes * interval '1 minute'
  ) THEN
    RAISE EXCEPTION 'Horario ocupado por otro turno fijo' USING ERRCODE='23505';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.appointments a
    JOIN generate_series(
      greatest((now() AT TIME ZONE 'America/Montevideo')::date,NEW.start_date),
      least((now() AT TIME ZONE 'America/Montevideo')::date+29,
        coalesce(NEW.end_date,'infinity'::date)), interval '1 day') days(d)
      ON a.date_string=public.booking_display_label(days.d::date)
    WHERE a.shop_id=NEW.shop_id AND a.barber_id=NEW.barber_id
      AND a.status='confirmado'
      AND extract(dow from days.d)::int=NEW.weekday
      AND days.d::date <> ALL(NEW.skipped_dates)
      AND NEW.time_slot::time < a.time_slot::time + a.duration_minutes * interval '1 minute'
      AND a.time_slot::time < NEW.time_slot::time + NEW.duration_minutes * interval '1 minute'
  ) THEN
    RAISE EXCEPTION 'Horario ocupado por una reserva anterior' USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_zzzz_hourly_new_fixed_booking ON public.fixed_bookings;
-- Runs after trg_validate_fixed_booking, which snapshots the real service duration.
CREATE TRIGGER trg_zzzz_hourly_new_fixed_booking
BEFORE INSERT OR UPDATE OF shop_id,barber_id,service_id,weekday,time_slot,duration_minutes,start_date,end_date,active
ON public.fixed_bookings
FOR EACH ROW EXECUTE FUNCTION public.guard_new_hourly_fixed_booking();

REVOKE ALL ON FUNCTION public.guard_new_hourly_appointment() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.guard_new_hourly_fixed_booking() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_new_hourly_appointment() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_new_hourly_fixed_booking() TO service_role;
COMMIT;
