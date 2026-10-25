-- 13 CUT — corregir tolerancia hacia atrás para turnos fijos y comunes.
-- No toca filas, estados, duraciones, horarios guardados ni triggers existentes.
-- Aplicar primero en staging, luego en producción tras QA de solo lectura.
-- Ejecutar todo en una sola transacción; si falla el preflight, no aplica nada.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='50s';
DO $guard$
BEGIN
 IF md5(pg_get_functiondef('public.guard_weekly_bookings()'::regprocedure))
     <> '1c0bd7ec72440ec024000406c7a394d6' OR
    md5(pg_get_functiondef('public.validate_fixed_booking()'::regprocedure))
     <> 'e55ec94bd41a2990d01dcd47e1fc90fc' THEN
   RAISE EXCEPTION 'Funciones de agenda diferentes: ABORTAR y revisar antes de aplicar';
 END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.booking_conflicts_one_way(
 p_candidate_time text, p_candidate_minutes integer,
 p_booked_time text, p_booked_minutes integer
) RETURNS boolean
 LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $oneway$
DECLARE
 v_candidate integer;
 v_booked integer;
 v_shared integer;
BEGIN
 -- Nunca dejar entrar horarios mal formados, iguales ni duraciones erróneas.
 IF p_candidate_time IS NULL OR p_booked_time IS NULL OR
    p_candidate_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR
    p_booked_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR
    p_candidate_minutes IS NULL OR p_booked_minutes IS NULL OR
    p_candidate_minutes <= 0 OR p_booked_minutes <= 0 THEN
   RETURN true;
 END IF;
 v_candidate := substring(p_candidate_time,1,2)::integer*60 +
                substring(p_candidate_time,4,2)::integer;
 v_booked := substring(p_booked_time,1,2)::integer*60 +
             substring(p_booked_time,4,2)::integer;
 IF v_candidate = v_booked THEN RETURN true; END IF;
 v_shared := greatest(0,
   least(v_candidate+p_candidate_minutes,v_booked+p_booked_minutes) -
   greatest(v_candidate,v_booked));
 IF v_shared = 0 THEN RETURN false; END IF;
 -- Tolerancia únicamente al crear un turno ANTES de uno ya reservado.
 -- Se permiten <=30 minutos compartidos, únicamente si ambos duran <90.
 RETURN v_candidate > v_booked OR
   p_candidate_minutes >= 90 OR p_booked_minutes >= 90 OR
   v_shared > 30;
END;
$oneway$;

REVOKE ALL ON FUNCTION public.booking_conflicts_one_way(text,integer,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.booking_conflicts_one_way(text,integer,text,integer) TO service_role;

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
 AND public.booking_conflicts_one_way(
   NEW.time_slot,NEW.duration_minutes,f.time_slot,f.duration_minutes
 )
 ) THEN
   RAISE EXCEPTION 'Horario reservado para un cliente de agenda fija' USING ERRCODE='23505';
 END IF;
 RETURN NEW;
END $function$


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
    AND public.booking_conflicts_one_way(
      NEW.time_slot,NEW.duration_minutes,a.time_slot,a.duration_minutes
    )
 ) THEN RAISE EXCEPTION 'Hay reservas existentes en uno de esos días; elegí otro horario' USING ERRCODE='23505'; END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END $function$


COMMIT;
