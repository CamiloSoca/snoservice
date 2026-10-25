-- SNOSERVICE: additive weekly rules and protected standing-appointment blocks.
ALTER TABLE public.barbers ADD COLUMN IF NOT EXISTS working_schedule jsonb;

CREATE OR REPLACE FUNCTION public.valid_weekly_schedule(p jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public
AS $$
 SELECT p IS NULL OR
 (
   jsonb_typeof(p)='object'
   AND (SELECT count(*)=7 FROM jsonb_object_keys(p)) IS TRUE
   AND NOT EXISTS (
     SELECT 1 FROM unnest(ARRAY['lunes','martes','miercoles','jueves','viernes','sabado','domingo']) AS k
     WHERE NOT (p ? k) OR jsonb_typeof(p->k)<>'object'
       OR jsonb_typeof(p->k->'isOpen')<>'boolean'
       OR (p->k->>'openTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR (p->k->>'closeTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR (p->k->>'openTime')::time >= (p->k->>'closeTime')::time
   )
 );
$$;
ALTER TABLE public.barbers DROP CONSTRAINT IF EXISTS barbers_working_schedule_valid;
ALTER TABLE public.barbers ADD CONSTRAINT barbers_working_schedule_valid CHECK (public.valid_weekly_schedule(working_schedule));

-- Extend pre-existing secure bulk upsert, retaining PIN semantics.
DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.save_barbers_secure(uuid,jsonb)'::regprocedure) INTO definition;
 IF strpos(definition,'working_schedule')=0 THEN
   IF strpos(definition,'active=COALESCE((v_entry->>''active'')::boolean,true),')=0 OR
      strpos(definition,'commission_rate,is_owner,active,pin')=0 THEN
      RAISE EXCEPTION 'save_barbers_secure changed: manual review required';
   END IF;
   definition:=replace(definition,
     'active=COALESCE((v_entry->>''active'')::boolean,true),',
     'active=COALESCE((v_entry->>''active'')::boolean,true),'||E'\n        '||
     'working_schedule=CASE WHEN v_entry ? ''working_schedule'' THEN v_entry->''working_schedule'' ELSE working_schedule END,');
   definition:=replace(definition,
     'commission_rate,is_owner,active,pin',
     'commission_rate,is_owner,active,pin,working_schedule');
   definition:=replace(definition,
     'COALESCE((v_entry->>''active'')::boolean,true),v_pin',
     'COALESCE((v_entry->>''active'')::boolean,true),v_pin,v_entry->''working_schedule''');
   EXECUTE definition;
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.fixed_bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 shop_id uuid NOT NULL REFERENCES public.shops(id),
 barber_id uuid NOT NULL REFERENCES public.barbers(id),
 service_id uuid NOT NULL REFERENCES public.services(id),
 client_name text NOT NULL CHECK(length(btrim(client_name)) BETWEEN 3 AND 100),
 client_phone text NOT NULL DEFAULT '',
 client_email text NOT NULL DEFAULT '',
 weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
 time_slot text NOT NULL CHECK(time_slot ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 15 AND 720),
 start_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Montevideo')::date,
 end_date date,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(end_date IS NULL OR end_date>=start_date)
);
CREATE INDEX IF NOT EXISTS fixed_bookings_barber_week_idx
 ON public.fixed_bookings(shop_id,barber_id,weekday,time_slot) WHERE active;
ALTER TABLE public.fixed_bookings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fixed_bookings FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.fixed_bookings TO service_role;

-- Portable local date -> display label converter, matches the public 30-day agenda.
CREATE OR REPLACE FUNCTION public.booking_display_label(d date)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT (ARRAY['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'])[extract(dow from d)::integer+1]
 ||' '||extract(day from d)::integer||' '||
 (ARRAY['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'])[extract(month from d)::integer];
$$;
CREATE OR REPLACE FUNCTION public.booking_date_from_label(lbl text)
RETURNS date LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT d::date FROM generate_series(
  (now() AT TIME ZONE 'America/Montevideo')::date,
  (now() AT TIME ZONE 'America/Montevideo')::date+29, '1 day'::interval
 ) g(d) WHERE public.booking_display_label(d::date)=lbl LIMIT 1;
$$;

-- The fixed timetable and ordinary bookings share a serialized shop-scoped
-- validation barrier, including direct inserts that bypass Next.js.
CREATE OR REPLACE FUNCTION public.guard_weekly_bookings()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE
 d date; k text;
 shop_schedule jsonb; own jsonb; shop_rule jsonb; worker_rule jsonb;
 opening time; closing time; a time; mins integer;
BEGIN
 IF NEW.status<>'confirmado' THEN RETURN NEW; END IF;
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
 AND NEW.time_slot::time < f.time_slot::time+f.duration_minutes*interval '1 minute'
 AND f.time_slot::time < NEW.time_slot::time+NEW.duration_minutes*interval '1 minute'
 ) THEN
   RAISE EXCEPTION 'Horario reservado para un cliente de agenda fija' USING ERRCODE='23505';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_weekly_bookings ON public.appointments;
CREATE TRIGGER trg_guard_weekly_bookings
BEFORE INSERT OR UPDATE OF barber_id,date_string,time_slot,duration_minutes,status ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.guard_weekly_bookings();

-- New/edited recurring blocks must fit shop and barber schedules and cannot
-- collide with other weekly slots or upcoming confirmed appointments.
CREATE OR REPLACE FUNCTION public.validate_fixed_booking()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE
 shop_schedule jsonb; own_schedule jsonb; rule jsonb; worker jsonb;
 k text; open_time time; close_time time; start_at time; actual_duration int;
BEGIN
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
    AND NEW.time_slot::time < f.time_slot::time+f.duration_minutes*interval '1 minute'
    AND f.time_slot::time < NEW.time_slot::time+NEW.duration_minutes*interval '1 minute'
 ) THEN RAISE EXCEPTION 'Ya existe un fijo en ese horario' USING ERRCODE='23505'; END IF;
 IF NEW.active AND EXISTS (
  SELECT 1 FROM public.appointments a
  JOIN generate_series(greatest((now() AT TIME ZONE 'America/Montevideo')::date,NEW.start_date),
      least((now() AT TIME ZONE 'America/Montevideo')::date+29,COALESCE(NEW.end_date,'infinity'::date)), '1 day'::interval) dates(d)
       ON a.date_string=public.booking_display_label(dates.d::date)
  WHERE a.shop_id=NEW.shop_id AND a.barber_id=NEW.barber_id AND a.status='confirmado'
    AND extract(dow from dates.d)::int=NEW.weekday
    AND NEW.time_slot::time<a.time_slot::time+a.duration_minutes*interval '1 minute'
    AND a.time_slot::time<NEW.time_slot::time+NEW.duration_minutes*interval '1 minute'
 ) THEN RAISE EXCEPTION 'Hay reservas existentes en uno de esos días; elegí otro horario' USING ERRCODE='23505'; END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_fixed_booking ON public.fixed_bookings;
CREATE TRIGGER trg_validate_fixed_booking BEFORE INSERT OR UPDATE ON public.fixed_bookings
FOR EACH ROW EXECUTE FUNCTION public.validate_fixed_booking();

-- Notice fixed slots changed to open calendars in other sessions.
CREATE OR REPLACE FUNCTION public.bump_fixed_booking_agenda_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public.shops SET agenda_revision=COALESCE(agenda_revision,0)+1
 WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.shop_id ELSE NEW.shop_id END;
 RETURN COALESCE(NEW,OLD);
END $$;
DROP TRIGGER IF EXISTS trg_fixed_bookings_revision ON public.fixed_bookings;
CREATE TRIGGER trg_fixed_bookings_revision AFTER INSERT OR UPDATE OR DELETE ON public.fixed_bookings
FOR EACH ROW EXECUTE FUNCTION public.bump_fixed_booking_agenda_revision();

-- Make the existing fast public catalog include only non-sensitive barber working hours.
CREATE OR REPLACE FUNCTION public.public_shop_snapshot(p_shop_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO ''
AS $$
 SELECT jsonb_build_object(
 'shop', (SELECT to_jsonb(sh) FROM (
    SELECT id,name,phone,address,city,logo_url,background_image_url,cover_image_url,schedule
    FROM public.shops WHERE id=p_shop_id LIMIT 1) sh),
 'services', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM (
    SELECT id,name,price,duration_minutes,description,image_url,active
    FROM public.services WHERE shop_id=p_shop_id AND active IS TRUE) s),'[]'::jsonb),
 'barbers', COALESCE((SELECT jsonb_agg(to_jsonb(b)) FROM (
    SELECT id,slug,name,role,bio,specialties,service_ids,active,image_url,working_schedule
    FROM public.barbers WHERE shop_id=p_shop_id AND active IS TRUE) b),'[]'::jsonb)
 );
$$;
