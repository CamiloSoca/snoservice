-- PREPARADO PARA PRODUCCIÓN, NO EJECUTADO. Requiere copia ensayada y
-- 01_owner_mapping.sql completado con la clasificación real del negocio.
-- Owners are flagged explicitly; their services go 100% to the common business fund.
-- Existing historical records remain untouched: legacy rows are not backfilled with guesses.
BEGIN;
ALTER TABLE public.barbers ADD COLUMN IF NOT EXISTS is_owner boolean;
DO $check$
BEGIN
  IF EXISTS (SELECT 1 FROM public.barbers WHERE is_owner IS NULL) OR
     NOT EXISTS (SELECT 1 FROM public.barbers WHERE is_owner IS TRUE) THEN
    RAISE EXCEPTION 'Clasificación de propietarios pendiente: completar 01_owner_mapping.sql';
  END IF;
END;
$check$;
ALTER TABLE public.barbers ALTER COLUMN is_owner SET NOT NULL;
ALTER TABLE public.barbers ALTER COLUMN is_owner SET DEFAULT false;
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS commission_rate_snapshot numeric(5,2),
  ADD COLUMN IF NOT EXISTS barber_earnings_snapshot numeric(12,2),
  ADD COLUMN IF NOT EXISTS business_earnings_snapshot numeric(12,2),
  ADD COLUMN IF NOT EXISTS completed_cash_register_id uuid REFERENCES public.cash_registers(id);
ALTER TABLE public.manual_charges
  ADD COLUMN IF NOT EXISTS commission_rate_snapshot numeric(5,2),
  ADD COLUMN IF NOT EXISTS barber_earnings_snapshot numeric(12,2),
  ADD COLUMN IF NOT EXISTS business_earnings_snapshot numeric(12,2),
  ADD COLUMN IF NOT EXISTS cash_register_id uuid REFERENCES public.cash_registers(id);

CREATE OR REPLACE FUNCTION public.snapshot_completed_appointment_finances()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $body$
DECLARE
  v_owner boolean;
  v_rate numeric;
  v_register uuid;
  v_amount numeric;
BEGIN
  IF NEW.status = 'completado' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completado' THEN
      SELECT b.is_owner, b.commission_rate INTO v_owner, v_rate
      FROM public.barbers b WHERE b.id = NEW.barber_id AND b.shop_id = NEW.shop_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Barbero inexistente en este negocio' USING ERRCODE='23514';
      END IF;
      SELECT c.id INTO v_register
      FROM public.cash_registers c
      WHERE c.shop_id=NEW.shop_id AND c.status='abierta'
      ORDER BY c.opened_at DESC LIMIT 1;
      IF v_register IS NULL THEN
        RAISE EXCEPTION 'Abrí la caja antes de completar turnos' USING ERRCODE='23514';
      END IF;
      v_amount := NEW.price_snapshot;
      IF v_amount IS NULL OR v_amount < 0 OR v_rate NOT BETWEEN 0 AND 100 THEN
        RAISE EXCEPTION 'Precio o comisión fuera de rango' USING ERRCODE='23514';
      END IF;
      NEW.completed_at := now();
      NEW.completed_cash_register_id := v_register;
      NEW.commission_rate_snapshot := CASE WHEN v_owner THEN 0 ELSE v_rate END;
      NEW.barber_earnings_snapshot := round(v_amount * NEW.commission_rate_snapshot / 100, 2);
      NEW.business_earnings_snapshot := v_amount - NEW.barber_earnings_snapshot;
    ELSIF NEW.price_snapshot IS DISTINCT FROM OLD.price_snapshot
       OR NEW.barber_id IS DISTINCT FROM OLD.barber_id
       OR NEW.shop_id IS DISTINCT FROM OLD.shop_id
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
       OR NEW.commission_rate_snapshot IS DISTINCT FROM OLD.commission_rate_snapshot
       OR NEW.barber_earnings_snapshot IS DISTINCT FROM OLD.barber_earnings_snapshot
       OR NEW.business_earnings_snapshot IS DISTINCT FROM OLD.business_earnings_snapshot
       OR NEW.completed_cash_register_id IS DISTINCT FROM OLD.completed_cash_register_id THEN
      RAISE EXCEPTION 'El cierre económico del turno completado es inmutable' USING ERRCODE='23514';
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'completado' THEN
    IF EXISTS (SELECT 1 FROM public.cash_registers c
      WHERE c.id=OLD.completed_cash_register_id AND c.status='cerrada') THEN
      RAISE EXCEPTION 'No se puede revertir un turno de una caja cerrada' USING ERRCODE='23514';
    END IF;
    NEW.completed_at := NULL;
    NEW.commission_rate_snapshot := NULL;
    NEW.barber_earnings_snapshot := NULL;
    NEW.business_earnings_snapshot := NULL;
    NEW.completed_cash_register_id := NULL;
  END IF;
  RETURN NEW;
END;
$body$;

DROP TRIGGER IF EXISTS trg_snapshot_completed_appointment_finances ON public.appointments;
CREATE TRIGGER trg_snapshot_completed_appointment_finances
BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.snapshot_completed_appointment_finances();

CREATE OR REPLACE FUNCTION public.snapshot_manual_charge_finances()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $body$
DECLARE
  v_owner boolean;
  v_rate numeric;
  v_register uuid;
BEGIN
  SELECT b.is_owner, b.commission_rate INTO v_owner, v_rate
  FROM public.barbers b WHERE b.id=NEW.barber_id AND b.shop_id=NEW.shop_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barbero inexistente en este negocio' USING ERRCODE='23514';
  END IF;
  IF NEW.amount IS NULL OR NEW.amount <= 0 OR v_rate NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'Monto o comisión fuera de rango' USING ERRCODE='23514';
  END IF;
  SELECT c.id INTO v_register
  FROM public.cash_registers c
  WHERE c.shop_id=NEW.shop_id AND c.status='abierta'
  ORDER BY c.opened_at DESC LIMIT 1;
  IF v_register IS NULL THEN
    RAISE EXCEPTION 'Abrí la caja antes de registrar cobros' USING ERRCODE='23514';
  END IF;
  NEW.cash_register_id := v_register;
  NEW.commission_rate_snapshot := CASE WHEN v_owner THEN 0 ELSE v_rate END;
  NEW.barber_earnings_snapshot := round(NEW.amount * NEW.commission_rate_snapshot / 100, 2);
  NEW.business_earnings_snapshot := NEW.amount - NEW.barber_earnings_snapshot;
  RETURN NEW;
END;
$body$;

DROP TRIGGER IF EXISTS trg_snapshot_manual_charge_finances ON public.manual_charges;
CREATE TRIGGER trg_snapshot_manual_charge_finances
BEFORE INSERT ON public.manual_charges
FOR EACH ROW EXECUTE FUNCTION public.snapshot_manual_charge_finances();

REVOKE ALL ON FUNCTION public.snapshot_completed_appointment_finances() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_completed_appointment_finances() TO service_role;
REVOKE ALL ON FUNCTION public.snapshot_manual_charge_finances() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_manual_charge_finances() TO service_role;
COMMIT;
