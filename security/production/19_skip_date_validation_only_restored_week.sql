-- 13 CUT: restaurar una semana aislada sin revalidar los demás martes.
-- Protege la tolerancia exclusivamente hacia atrás; no mueve ni altera reservas.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='50s';
DO $preflight$
BEGIN
 IF md5(pg_get_functiondef('public.validate_fixed_booking()'::regprocedure))
     <> '42e5ccf88fdfe6fe69e86517c4a23c75'
    OR to_regprocedure('public.booking_conflicts_one_way(text,integer,text,integer)') IS NULL
    OR EXISTS(SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='fixed_bookings' AND column_name='skipped_dates'
        AND udt_name <> '_date') THEN
   RAISE EXCEPTION 'Función de agenda distinta: revisar antes de aplicar';
 END IF;
END;
$preflight$;
CREATE OR REPLACE FUNCTION public.validate_fixed_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
 shop_schedule jsonb; own_schedule jsonb; rule jsonb; worker jsonb;
 k text; open_time time; close_time time; start_at time; actual_duration int;
 v_restore_date date;
BEGIN
 -- Pausing must ALWAYS be possible, even when the shop/staff has since closed.
 IF NOT NEW.active THEN
   NEW.updated_at:=now();
   RETURN NEW;
 END IF;
 -- Modificar solo las ausencias semanales no es reprogramar el turno.
 -- No revalidar todas las semanas: otro corte puede haberse reservado
 -- legítimamente ANTES de este fijo mediante la tolerancia unidireccional.
 IF TG_OP='UPDATE'
   AND NEW.skipped_dates IS DISTINCT FROM OLD.skipped_dates
   AND NEW.shop_id IS NOT DISTINCT FROM OLD.shop_id
   AND NEW.barber_id IS NOT DISTINCT FROM OLD.barber_id
   AND NEW.service_id IS NOT DISTINCT FROM OLD.service_id
   AND NEW.weekday IS NOT DISTINCT FROM OLD.weekday
   AND NEW.time_slot IS NOT DISTINCT FROM OLD.time_slot
   AND NEW.duration_minutes IS NOT DISTINCT FROM OLD.duration_minutes
   AND NEW.start_date IS NOT DISTINCT FROM OLD.start_date
   AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date
   AND NEW.active IS NOT DISTINCT FROM OLD.active THEN
   -- Mantener la misma protección concurrente que reservar/activar un fijo.
   PERFORM pg_advisory_xact_lock(hashtextextended('13cut-fixed-oneway:' || NEW.shop_id::text,0));
   -- Liberar fechas nunca crea nuevos conflictos. Al RESTAURAR sí se valida
   -- solamente cada fecha añadida de vuelta, no otras semanas ya reservadas.
   FOREACH v_restore_date IN ARRAY OLD.skipped_dates LOOP
     IF v_restore_date <> ALL(NEW.skipped_dates)
       AND v_restore_date BETWEEN NEW.start_date AND COALESCE(NEW.end_date,'infinity'::date)
       AND extract(dow from v_restore_date)::int=NEW.weekday THEN
       IF EXISTS (
         SELECT 1 FROM public.fixed_bookings f
         WHERE f.id<>NEW.id AND f.shop_id=NEW.shop_id AND f.barber_id=NEW.barber_id
           AND f.active AND f.weekday=NEW.weekday
           AND v_restore_date BETWEEN f.start_date AND COALESCE(f.end_date,'infinity'::date)
           AND v_restore_date <> ALL(f.skipped_dates)
           AND public.booking_conflicts_one_way(NEW.time_slot,NEW.duration_minutes,f.time_slot,f.duration_minutes)
       ) THEN
         RAISE EXCEPTION 'No se puede restaurar esa fecha: otro fijo ocupa el horario'
           USING ERRCODE='23505';
       END IF;
       IF v_restore_date BETWEEN (now() AT TIME ZONE 'America/Montevideo')::date
         AND (now() AT TIME ZONE 'America/Montevideo')::date+29
         AND EXISTS (
           SELECT 1 FROM public.appointments a
           WHERE a.shop_id=NEW.shop_id AND a.barber_id=NEW.barber_id
             AND a.status='confirmado'
             AND a.date_string=public.booking_display_label(v_restore_date)
             AND public.booking_conflicts_one_way(NEW.time_slot,NEW.duration_minutes,a.time_slot,a.duration_minutes)
         ) THEN
          RAISE EXCEPTION 'No se puede restaurar esa fecha: ya existe una reserva'
            USING ERRCODE='23505';
       END IF;
     END IF;
   END LOOP;
   NEW.updated_at:=now();
   RETURN NEW;
 END IF;
 -- Misma barrera serializada que en la reserva común; ANTES del bloqueo del local.
 PERFORM pg_advisory_xact_lock(hashtextextended('13cut-fixed-oneway:' || NEW.shop_id::text,0));
 SELECT schedule INTO shop_schedule FROM public.shops WHERE id=NEW.shop_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Local inexistente' USING ERRCODE='23514'; END IF;
 SELECT working_schedule INTO own_schedule FROM public.barbers
 WHERE id=NEW.barber_id AND shop_id=NEW.shop_id AND active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Barbero no disponible' USING ERRCODE='23514'; END IF;
 SELECT duration_minutes INTO actual_duration FROM public.services
 WHERE id=NEW.service_id AND shop_id=NEW.shop_id AND active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Servicio no disponible' USING ERRCODE='23514'; END IF;
 NEW.duration_minutes:=actual_duration;
 k:=(ARRAY['domingo','lunes','martes','miercoles','jueves','viernes','sabado'])[NEW.weekday+1];
 rule:=shop_schedule->k;worker:=own_schedule->k;
 IF rule->>'isOpen' IS DISTINCT FROM 'true' OR
    (own_schedule IS NOT NULL AND worker->>'isOpen' IS DISTINCT FROM 'true') THEN
    RAISE EXCEPTION 'El local o el barbero no atienden ese día' USING ERRCODE='23514';
 END IF;
 open_time:=(rule->>'openTime')::time;close_time:=(rule->>'closeTime')::time;
 IF own_schedule IS NOT NULL THEN
   open_time:=greatest(open_time,(worker->>'openTime')::time);
   close_time:=least(close_time,(worker->>'closeTime')::time);
 END IF;
 start_at:=NEW.time_slot::time;
 IF start_at<open_time OR start_at>=close_time OR
    start_at+actual_duration*interval '1 minute'>
    close_time+(CASE WHEN actual_duration<90 THEN interval '30 minutes' ELSE interval '0 minutes' END) THEN
   RAISE EXCEPTION 'Turno fijo fuera del horario de atención' USING ERRCODE='23514';
 END IF;
 IF NEW.active AND EXISTS (
  SELECT 1 FROM public.fixed_bookings f
  WHERE f.shop_id=NEW.shop_id AND f.barber_id=NEW.barber_id AND f.active AND f.id<>NEW.id
    AND f.weekday=NEW.weekday
    AND f.start_date<=COALESCE(NEW.end_date,'infinity'::date)
    AND NEW.start_date<=COALESCE(f.end_date,'infinity'::date)
    AND public.booking_conflicts_one_way(
      NEW.time_slot,NEW.duration_minutes,f.time_slot,f.duration_minutes
    )
 ) THEN RAISE EXCEPTION 'Ya existe un fijo en ese horario' USING ERRCODE='23505'; END IF;
 IF NEW.active AND EXISTS (
  SELECT 1 FROM public.appointments a
  JOIN generate_series(greatest((now() AT TIME ZONE 'America/Montevideo')::date,NEW.start_date),
      least((now() AT TIME ZONE 'America/Montevideo')::date+29,COALESCE(NEW.end_date,'infinity'::date)), '1 day'::interval) dates(d)
       ON a.date_string=public.booking_display_label(dates.d::date)
  WHERE a.shop_id=NEW.shop_id AND a.barber_id=NEW.barber_id AND a.status='confirmado'
    AND extract(dow from dates.d)::int=NEW.weekday
    AND dates.d::date <> ALL(NEW.skipped_dates)
    AND public.booking_conflicts_one_way(
      NEW.time_slot,NEW.duration_minutes,a.time_slot,a.duration_minutes
    )
 ) THEN RAISE EXCEPTION 'Hay reservas existentes en uno de esos días; elegí otro horario' USING ERRCODE='23505'; END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END $function$;

COMMIT;
