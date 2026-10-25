-- 13 CUT - excepciones de una sola fecha en un turno fijo semanal.
-- La fecha de fin sigue siendo opcional. Esta migración no cambia turnos existentes.
-- Primero staging, luego producción, antes de desplegar el frontend.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='55s';
DO $preflight$
BEGIN
 IF to_regclass('public.fixed_bookings') IS NULL OR
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='fixed_bookings' AND column_name='skipped_dates') OR
    md5(pg_get_functiondef('public.guard_weekly_bookings()'::regprocedure))
      <> 'b27ca7b086a04046904a6b5cd494af63' OR
    md5(pg_get_functiondef('public.validate_fixed_booking()'::regprocedure))
      <> 'dc52bf40d1615cfd108ff9ea4314dbad' THEN
   RAISE EXCEPTION 'Esquema de agenda inesperado: revisar antes de aplicar';
 END IF;
END;
$preflight$;
ALTER TABLE public.fixed_bookings
 ADD COLUMN skipped_dates date[] NOT NULL DEFAULT ARRAY[]::date[];
ALTER TABLE public.fixed_bookings
 ADD CONSTRAINT fixed_bookings_skip_limit CHECK (cardinality(skipped_dates)<=260);
CREATE OR REPLACE FUNCTION public.guard_weekly_bookings()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
 d date; k text;
 shop_schedule jsonb; own jsonb; shop_rule jsonb; worker_rule jsonb;
 opening time; closing time; a time; mins integer;
BEGIN
 IF NEW.status<>'confirmado' THEN RETURN NEW; END IF;
 -- Serializa fijos y comunes, para no aceptar operaciones concurrentes
 -- que se crucen antes de ver los datos confirmados.
 PERFORM pg_advisory_xact_lock(hashtextextended('13cut-fixed-oneway:' || NEW.shop_id::text,0));
 SELECT working_schedule INTO own FROM public.barbers WHERE id=NEW.barber_id AND shop_id=NEW.shop_id;
 d:=public.booking_date_from_label(NEW.date_string);
 IF d IS NULL THEN RETURN NEW; END IF; -- original booking validator rejects the date
 k:=(ARRAY['domingo','lunes','martes','miercoles','jueves','viernes','sabado'])[extract(dow from d)::integer+1];
 IF own IS NOT NULL THEN
   SELECT schedule INTO shop_schedule FROM public.shops WHERE id=NEW.shop_id;
   shop_rule:=shop_schedule->k;worker_rule:=own->k;
   IF worker_rule->>'isOpen' IS DISTINCT FROM 'true' OR shop_rule->>'isOpen' IS DISTINCT FROM 'true' THEN
     RAISE EXCEPTION 'Este barbero no atiende ese día' USING ERRCODE='23514';
   END IF;
   opening:=greatest((shop_rule->>'openTime')::time,(worker_rule->>'openTime')::time);
   closing:=least((shop_rule->>'closeTime')::time,(worker_rule->>'closeTime')::time);
   a:=NEW.time_slot::time;
   IF a<opening OR a>=closing OR a+NEW.duration_minutes*interval '1 minute'>
     closing+(CASE WHEN NEW.duration_minutes<90 THEN interval '30 minutes' ELSE interval '0 minutes' END) THEN
     RAISE EXCEPTION 'Fuera del horario del barbero' USING ERRCODE='23514';
   END IF;
 END IF;
 -- See recurrence data in the same transaction as the booking.
 IF EXISTS (
 SELECT 1 FROM public.fixed_bookings f
 WHERE f.shop_id=NEW.shop_id AND f.barber_id=NEW.barber_id AND f.active
 AND f.weekday=extract(dow from d)::integer
 AND d BETWEEN f.start_date AND COALESCE(f.end_date,'infinity'::date)
 AND d <> ALL(f.skipped_dates)
 AND public.booking_conflicts_one_way(
   NEW.time_slot,NEW.duration_minutes,f.time_slot,f.duration_minutes
 )
 ) THEN
   RAISE EXCEPTION 'Horario reservado para un cliente de agenda fija' USING ERRCODE='23505';
 END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.validate_fixed_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
 shop_schedule jsonb; own_schedule jsonb; rule jsonb; worker jsonb;
 k text; open_time time; close_time time; start_at time; actual_duration int;
BEGIN
 -- Pausing must ALWAYS be possible, even when the shop/staff has since closed.
 IF NOT NEW.active THEN
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

CREATE OR REPLACE FUNCTION public.set_fixed_booking_week_skip(
 p_shop_id uuid, p_fixed_id uuid, p_occurrence date, p_skip boolean
) RETURNS boolean
 LANGUAGE plpgsql SECURITY INVOKER
 SET search_path TO 'pg_catalog', 'public'
AS $week_skip$
DECLARE
 v public.fixed_bookings%ROWTYPE;
 v_today date := (clock_timestamp() AT TIME ZONE 'America/Montevideo')::date;
BEGIN
 IF p_shop_id IS NULL OR p_fixed_id IS NULL OR p_occurrence IS NULL OR p_skip IS NULL
    OR p_occurrence<v_today THEN
   RAISE EXCEPTION 'Fecha inválida o ya pasada' USING ERRCODE='23514';
 END IF;
 -- Row lock evita que dos administradores se pisen excepciones.
 SELECT * INTO v FROM public.fixed_bookings
 WHERE shop_id=p_shop_id AND id=p_fixed_id FOR UPDATE;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'Turno fijo inexistente' USING ERRCODE='23503';
 END IF;
 IF NOT v.active OR p_occurrence<v.start_date
   OR (v.end_date IS NOT NULL AND p_occurrence>v.end_date)
   OR extract(dow from p_occurrence)::int<>v.weekday THEN
   RAISE EXCEPTION 'La fecha no corresponde a un turno fijo activo'
     USING ERRCODE='23514';
 END IF;
 IF p_skip AND p_occurrence=ANY(v.skipped_dates) THEN RETURN false; END IF;
 IF NOT p_skip AND p_occurrence<>ALL(v.skipped_dates) THEN RETURN false; END IF;
 UPDATE public.fixed_bookings SET skipped_dates=
    CASE WHEN p_skip THEN
      ARRAY(SELECT DISTINCT x FROM unnest(v.skipped_dates||ARRAY[p_occurrence]) AS x ORDER BY x)
    ELSE
      array_remove(v.skipped_dates,p_occurrence)
    END
 WHERE shop_id=p_shop_id AND id=p_fixed_id;
 -- La validación del trigger impide reactivar si esa fecha ya fue reservada.
 RETURN true;
END;
$week_skip$;
REVOKE ALL ON FUNCTION public.set_fixed_booking_week_skip(uuid,uuid,date,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_fixed_booking_week_skip(uuid,uuid,date,boolean)
 TO service_role;
COMMIT;
