-- Preparada para staging: NO aplicar en produccion antes de QA y prueba SMTP.
-- Registro durable de aviso al agotar 4 cortes, sin alterar caja ni reservas.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fixed_monthly_notices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 shop_id uuid NOT NULL REFERENCES public.shops(id),
 fixed_booking_id uuid NOT NULL,
 period_id uuid NOT NULL UNIQUE REFERENCES public.fixed_monthly_periods(id) ON DELETE RESTRICT,
 fourth_occurrence_date date NOT NULL,
 next_occurrence_date date NOT NULL,
 next_time_slot text NOT NULL,
 recipient_email text NOT NULL,
 client_name text NOT NULL,
 shop_name text NOT NULL,
 status text NOT NULL DEFAULT 'pending'
   CHECK (status IN ('pending','sending','accepted','failed','missing_email')),
 attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
 reserved_at timestamptz,
 accepted_at timestamptz,
 provider_message_id text,
 last_failure text,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT valid_notice_dates CHECK(
   next_occurrence_date>fourth_occurrence_date AND
   date_trunc('month',next_occurrence_date::timestamp)=date_trunc('month',fourth_occurrence_date::timestamp))
);
CREATE INDEX IF NOT EXISTS fixed_monthly_notices_pending_idx
 ON public.fixed_monthly_notices(status,created_at)
 WHERE status IN ('pending','failed','sending');
ALTER TABLE public.fixed_monthly_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fixed_monthly_notices FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.fixed_monthly_notices TO service_role;

-- AFTER INSERT sobre el uso completado y confirmado. No manda correo dentro
-- de la transaccion; crea un evento durable, unico por mensualidad.
CREATE OR REPLACE FUNCTION public.enqueue_fixed_monthly_exhaustion_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE
 v_period public.fixed_monthly_periods%ROWTYPE;
 v_fixed public.fixed_bookings%ROWTYPE;
 v_next date;
 v_name text;
 v_used integer;
 v_recipient text;
BEGIN
 SELECT * INTO v_period FROM public.fixed_monthly_periods
 WHERE id=NEW.period_id AND shop_id=NEW.shop_id AND fixed_booking_id=NEW.fixed_booking_id;
 IF NOT FOUND OR v_period.period_month<>date_trunc('month',NEW.occurrence_date)::date
 THEN RETURN NEW; END IF;
 SELECT COUNT(*) INTO v_used FROM public.fixed_monthly_uses WHERE period_id=NEW.period_id;
 IF v_used<>v_period.included_cuts THEN RETURN NEW; END IF;
 SELECT * INTO v_fixed FROM public.fixed_bookings
 WHERE id=NEW.fixed_booking_id AND shop_id=NEW.shop_id;
 IF NOT FOUND OR NOT v_fixed.active OR v_fixed.complimentary THEN RETURN NEW; END IF;
 SELECT dates.day::date INTO v_next
 FROM generate_series(
   NEW.occurrence_date+1,
   (date_trunc('month',NEW.occurrence_date)::date+interval '1 month - 1 day')::date,
   interval '1 day') AS dates(day)
 WHERE EXTRACT(dow from dates.day)::int=v_fixed.weekday
   AND dates.day::date>=v_fixed.start_date
   AND (v_fixed.end_date IS NULL OR dates.day::date<=v_fixed.end_date)
   AND dates.day::date <> ALL(v_fixed.skipped_dates)
   AND dates.day::date>=(clock_timestamp() AT TIME ZONE 'America/Montevideo')::date
   AND NOT EXISTS (
     SELECT 1 FROM public.manual_charges paid
     WHERE paid.shop_id=NEW.shop_id AND paid.fixed_booking_id=NEW.fixed_booking_id
       AND paid.fixed_occurrence_date=dates.day::date
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.fixed_courtesy_uses gifted
     WHERE gifted.shop_id=NEW.shop_id AND gifted.fixed_booking_id=NEW.fixed_booking_id
       AND gifted.occurrence_date=dates.day::date
   )
 ORDER BY dates.day LIMIT 1;
 IF v_next IS NULL THEN RETURN NEW; END IF;
 SELECT name INTO v_name FROM public.shops WHERE id=NEW.shop_id;
 v_recipient:=lower(trim(coalesce(v_fixed.client_email,'')));
 INSERT INTO public.fixed_monthly_notices
 (shop_id,fixed_booking_id,period_id,fourth_occurrence_date,next_occurrence_date,
  next_time_slot,recipient_email,client_name,shop_name,status)
 VALUES
 (NEW.shop_id,NEW.fixed_booking_id,NEW.period_id,NEW.occurrence_date,v_next,
  v_fixed.time_slot,v_recipient,v_fixed.client_name,coalesce(v_name,'13 CUT'),
   CASE WHEN v_recipient~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
       THEN 'pending' ELSE 'missing_email' END)
 ON CONFLICT (period_id) DO NOTHING;
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN
 -- El correo es auxiliar: jamás abortar el cuarto corte por un error del aviso.
 RAISE WARNING 'No se pudo encolar aviso de mensualidad (SQLSTATE %)',SQLSTATE;
 RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_fixed_monthly_exhaustion_notice ON public.fixed_monthly_uses;
CREATE TRIGGER trg_fixed_monthly_exhaustion_notice
AFTER INSERT ON public.fixed_monthly_uses
FOR EACH ROW EXECUTE FUNCTION public.enqueue_fixed_monthly_exhaustion_notice();

-- Claim atomico: no dos procesos SMTP concurrentes para el mismo periodo.
-- Un intento cuya instancia murio puede recuperarse pasado 20 minutos.
CREATE OR REPLACE FUNCTION public.claim_fixed_monthly_notice(
 p_shop_id uuid, p_period_id uuid DEFAULT NULL
) RETURNS TABLE (
 notice_id uuid, period_id uuid, recipient_email text,
 client_name text, shop_name text, next_occurrence_date date, next_time_slot text
)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','public'
AS $fn$
BEGIN
 RETURN QUERY
 WITH picked AS (
   SELECT n.id FROM public.fixed_monthly_notices n
   WHERE n.shop_id=p_shop_id
     AND (p_period_id IS NULL OR n.period_id=p_period_id)
     AND n.attempts<3
     AND (
       n.status='pending'
       OR (n.status='failed' AND n.reserved_at<clock_timestamp()-interval '1 hour')
       OR (n.status='sending' AND n.reserved_at<clock_timestamp()-interval '20 minutes')
     )
     AND n.next_occurrence_date>=(clock_timestamp() AT TIME ZONE 'America/Montevideo')::date
   ORDER BY n.created_at
   LIMIT 1 FOR UPDATE SKIP LOCKED
 )
 UPDATE public.fixed_monthly_notices n
 SET status='sending',reserved_at=clock_timestamp(),attempts=n.attempts+1,last_failure=NULL
 FROM picked WHERE n.id=picked.id
 RETURNING n.id,n.period_id,n.recipient_email,n.client_name,n.shop_name,
           n.next_occurrence_date,n.next_time_slot;
END;
$fn$;

-- Guardar resultado: el correo aceptado por SMTP no garantiza bandeja de entrada.
CREATE OR REPLACE FUNCTION public.finish_fixed_monthly_notice(
 p_shop_id uuid,p_notice_id uuid,p_status text,p_message_id text DEFAULT NULL,
 p_failure text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','public'
AS $fn$
BEGIN
 IF p_status NOT IN ('accepted','failed') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
 UPDATE public.fixed_monthly_notices
 SET status=p_status,
     accepted_at=CASE WHEN p_status='accepted' THEN clock_timestamp() ELSE NULL END,
     provider_message_id=left(coalesce(p_message_id,''),200),
     last_failure=CASE WHEN p_status='failed' THEN left(coalesce(p_failure,'SMTP rejected'),100) ELSE NULL END
 WHERE id=p_notice_id AND shop_id=p_shop_id AND status='sending';
 RETURN FOUND;
END;
$fn$;

REVOKE ALL ON FUNCTION public.enqueue_fixed_monthly_exhaustion_notice(),
 public.claim_fixed_monthly_notice(uuid,uuid),
 public.finish_fixed_monthly_notice(uuid,uuid,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_fixed_monthly_exhaustion_notice(),
 public.claim_fixed_monthly_notice(uuid,uuid),
 public.finish_fixed_monthly_notice(uuid,uuid,text,text,text)
 TO service_role;
COMMIT;
