-- Servicios de cortesía: trabajo realizado sin entrada de dinero ni cambio de caja.
-- No altera ningún movimiento anterior. Los fijos existentes siguen siendo pagos.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';

ALTER TABLE public.fixed_bookings
  ADD COLUMN IF NOT EXISTS complimentary boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.fixed_courtesy_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  fixed_booking_id uuid NOT NULL REFERENCES public.fixed_bookings(id) ON DELETE RESTRICT,
  occurrence_date date NOT NULL,
  barber_id uuid NOT NULL REFERENCES public.barbers(id),
  service_name_snapshot text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fixed_courtesy_uses_once UNIQUE(shop_id,fixed_booking_id,occurrence_date)
);
CREATE INDEX IF NOT EXISTS fixed_courtesy_uses_barber_date
  ON public.fixed_courtesy_uses(shop_id,barber_id,occurrence_date);
ALTER TABLE public.fixed_courtesy_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fixed_courtesy_uses FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.fixed_courtesy_uses TO service_role;

CREATE OR REPLACE FUNCTION public.guard_fixed_courtesy_immutable()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public'
AS $$
BEGIN
  RAISE EXCEPTION 'Las cortesías completadas no se modifican; requerirían una corrección auditada'
    USING ERRCODE='23514';
END;
$$;
DROP TRIGGER IF EXISTS trg_fixed_courtesy_immutable ON public.fixed_courtesy_uses;
CREATE TRIGGER trg_fixed_courtesy_immutable
 BEFORE UPDATE OR DELETE ON public.fixed_courtesy_uses
 FOR EACH ROW EXECUTE FUNCTION public.guard_fixed_courtesy_immutable();
REVOKE ALL ON FUNCTION public.guard_fixed_courtesy_immutable()
  FROM PUBLIC,anon,authenticated;

-- Protege contra solicitudes pagas manipuladas o carreras entre usuarios.
CREATE OR REPLACE FUNCTION public.guard_fixed_courtesy_finance()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public'
AS $$
DECLARE v_occurrence date;
BEGIN
  IF NEW.fixed_booking_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM public.fixed_bookings f
     WHERE f.id=NEW.fixed_booking_id AND f.shop_id=NEW.shop_id AND f.complimentary) THEN
    RAISE EXCEPTION 'El turno fijo es cortesía y no se puede cobrar'
      USING ERRCODE='23514';
  END IF;
  v_occurrence := CASE WHEN TG_TABLE_NAME='manual_charges'
    THEN NEW.fixed_occurrence_date ELSE NEW.occurrence_date END;
  IF v_occurrence IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.fixed_courtesy_uses u
    WHERE u.shop_id=NEW.shop_id AND u.fixed_booking_id=NEW.fixed_booking_id
      AND u.occurrence_date=v_occurrence
  ) THEN
    RAISE EXCEPTION 'La fecha ya se completó como cortesía' USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fixed_courtesy_guard_charge ON public.manual_charges;
CREATE TRIGGER trg_fixed_courtesy_guard_charge BEFORE INSERT
 ON public.manual_charges FOR EACH ROW EXECUTE FUNCTION public.guard_fixed_courtesy_finance();
DROP TRIGGER IF EXISTS trg_fixed_courtesy_guard_subscription ON public.fixed_monthly_uses;
CREATE TRIGGER trg_fixed_courtesy_guard_subscription BEFORE INSERT
 ON public.fixed_monthly_uses FOR EACH ROW EXECUTE FUNCTION public.guard_fixed_courtesy_finance();
REVOKE ALL ON FUNCTION public.guard_fixed_courtesy_finance()
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.complete_fixed_courtesy_occurrence(
 p_shop_id uuid,p_fixed_id uuid,p_occurrence date
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','public'
AS $$
DECLARE
 v_fixed public.fixed_bookings%ROWTYPE;
 v_now timestamp := clock_timestamp() AT TIME ZONE 'America/Montevideo';
 v_service_name text;
 v_use uuid;
BEGIN
 IF p_shop_id IS NULL OR p_fixed_id IS NULL OR p_occurrence IS NULL THEN
   RAISE EXCEPTION 'Faltan datos de la cortesía' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_fixed FROM public.fixed_bookings
 WHERE id=p_fixed_id AND shop_id=p_shop_id FOR UPDATE;
 IF NOT FOUND OR NOT v_fixed.active OR NOT v_fixed.complimentary
   OR p_occurrence<v_fixed.start_date
   OR (v_fixed.end_date IS NOT NULL AND p_occurrence>v_fixed.end_date)
   OR extract(dow FROM p_occurrence)::int<>v_fixed.weekday
   OR p_occurrence=ANY(v_fixed.skipped_dates)
   OR p_occurrence>v_now::date
   OR (p_occurrence=v_now::date AND v_fixed.time_slot::time>v_now::time) THEN
   RAISE EXCEPTION 'Esta cortesía no corresponde a un turno ya iniciado'
     USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.manual_charges c
    WHERE c.shop_id=p_shop_id AND c.fixed_booking_id=p_fixed_id
      AND c.fixed_occurrence_date=p_occurrence)
   OR EXISTS(SELECT 1 FROM public.fixed_monthly_uses u
    WHERE u.shop_id=p_shop_id AND u.fixed_booking_id=p_fixed_id
      AND u.occurrence_date=p_occurrence)
   OR EXISTS(SELECT 1 FROM public.fixed_courtesy_uses u
    WHERE u.shop_id=p_shop_id AND u.fixed_booking_id=p_fixed_id
      AND u.occurrence_date=p_occurrence) THEN
   RAISE EXCEPTION 'Esta fecha ya fue completada' USING ERRCODE='23505';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.barbers b
    WHERE b.shop_id=p_shop_id AND b.id=v_fixed.barber_id AND b.active) THEN
   RAISE EXCEPTION 'Barbero no disponible' USING ERRCODE='23514';
 END IF;
 SELECT s.name INTO v_service_name FROM public.services s
 WHERE s.id=v_fixed.service_id AND s.shop_id=p_shop_id AND s.active;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'Servicio no disponible' USING ERRCODE='23514';
 END IF;
 INSERT INTO public.fixed_courtesy_uses(
   shop_id,fixed_booking_id,occurrence_date,barber_id,service_name_snapshot
 ) VALUES (p_shop_id,p_fixed_id,p_occurrence,v_fixed.barber_id,v_service_name)
 RETURNING id INTO v_use;
 RETURN v_use;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_fixed_courtesy_occurrence(uuid,uuid,date)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_fixed_courtesy_occurrence(uuid,uuid,date)
 TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;