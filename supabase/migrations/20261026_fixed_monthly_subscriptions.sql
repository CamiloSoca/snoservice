-- SNOSERVICE | Abonos mensuales de agenda fija | REVISAR/APLICAR SOLO EN STAGING
-- NO ejecutar en producción sin aprobación y QA completo.
-- Supuestos temporales: cuatro cortes por MES CALENDARIO, sin arrastre y sin cobros automáticos.
BEGIN;

-- Abonos extiende el flujo de ocurrencias fijas ya instalado.
-- No crear tablas parciales si falta la base de caja/contabilidad.
DO $preflight$
BEGIN
  IF to_regclass('public.fixed_bookings') IS NULL
     OR to_regclass('public.manual_charges') IS NULL
     OR to_regclass('public.barbers') IS NULL
     OR to_regprocedure('public.cash_register_for_finance(uuid)') IS NULL
     OR to_regprocedure('public.booking_display_label(date)') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='manual_charges'
         AND column_name='fixed_booking_id'
     )
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='manual_charges'
         AND column_name='fixed_occurrence_date'
     )
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='fixed_bookings'
         AND column_name='skipped_dates'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger t
       WHERE t.tgrelid=to_regclass('public.manual_charges')
         AND t.tgname='trg_snapshot_manual_charge_finances'
         AND NOT t.tgisinternal
     ) THEN
    RAISE EXCEPTION 'Falta instalar la base de agenda fija y snapshots de caja/finanzas antes de Abonos mensuales';
  END IF;
END;
$preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS fixed_bookings_shop_id_id_uq
  ON public.fixed_bookings(shop_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS manual_charges_shop_id_id_uq
  ON public.manual_charges(shop_id,id);

CREATE TABLE public.fixed_monthly_plans (
  fixed_booking_id uuid PRIMARY KEY,
  shop_id uuid NOT NULL,
  monthly_price numeric(12,2) NOT NULL CHECK (monthly_price > 0 AND monthly_price <= 100000000),
  included_cuts smallint NOT NULL DEFAULT 4 CHECK (included_cuts = 4),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(shop_id,fixed_booking_id),
  FOREIGN KEY (shop_id,fixed_booking_id)
    REFERENCES public.fixed_bookings(shop_id,id) ON DELETE RESTRICT
);

CREATE TABLE public.fixed_monthly_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL,
  fixed_booking_id uuid NOT NULL,
  period_month date NOT NULL CHECK (extract(day from period_month) = 1),
  price_snapshot numeric(12,2) NOT NULL CHECK (price_snapshot > 0),
  included_cuts smallint NOT NULL DEFAULT 4 CHECK (included_cuts=4),
  paid_at timestamptz NOT NULL DEFAULT now(),
  payment_method text NOT NULL CHECK (payment_method IN ('cash','transfer')),
  manual_charge_id uuid NOT NULL UNIQUE,
  UNIQUE(shop_id,fixed_booking_id,period_month),
  UNIQUE(id,shop_id,fixed_booking_id),
  FOREIGN KEY (shop_id,manual_charge_id)
    REFERENCES public.manual_charges(shop_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (shop_id,fixed_booking_id)
    REFERENCES public.fixed_monthly_plans(shop_id,fixed_booking_id) ON DELETE RESTRICT
);

CREATE TABLE public.fixed_monthly_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL,
  fixed_booking_id uuid NOT NULL,
  period_id uuid NOT NULL,
  occurrence_date date NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(shop_id,fixed_booking_id,occurrence_date),
  FOREIGN KEY (period_id,shop_id,fixed_booking_id)
    REFERENCES public.fixed_monthly_periods(id,shop_id,fixed_booking_id) ON DELETE RESTRICT
);
CREATE INDEX fixed_monthly_uses_period_idx ON public.fixed_monthly_uses(period_id);
CREATE INDEX fixed_monthly_periods_shop_fixed_idx
  ON public.fixed_monthly_periods(shop_id,fixed_booking_id,period_month DESC);

ALTER TABLE public.fixed_monthly_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_monthly_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_monthly_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fixed_monthly_plans, public.fixed_monthly_periods, public.fixed_monthly_uses
  FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.fixed_monthly_plans TO service_role;
GRANT SELECT,INSERT ON public.fixed_monthly_periods, public.fixed_monthly_uses TO service_role;

CREATE FUNCTION public.guard_fixed_monthly_plan_owner()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog','public' AS $$
DECLARE v_is_owner boolean;
BEGIN
  SELECT b.is_owner INTO v_is_owner
  FROM public.fixed_bookings f JOIN public.barbers b
    ON b.id=f.barber_id AND b.shop_id=f.shop_id
  WHERE f.id=NEW.fixed_booking_id AND f.shop_id=NEW.shop_id;
  IF NOT FOUND OR v_is_owner IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Abonos disponibles únicamente para el dueño' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.shop_id IS DISTINCT FROM OLD.shop_id OR NEW.fixed_booking_id IS DISTINCT FROM OLD.fixed_booking_id THEN
      RAISE EXCEPTION 'No se puede reasignar un abono' USING ERRCODE='23514';
    END IF;
    NEW.updated_at:=now();
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_fixed_monthly_plan_owner BEFORE INSERT OR UPDATE ON public.fixed_monthly_plans
  FOR EACH ROW EXECUTE FUNCTION public.guard_fixed_monthly_plan_owner();

-- Nunca reasignar a otro barbero un fijo con abono histórico.
CREATE FUNCTION public.guard_fixed_monthly_fixed_owner()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog','public' AS $$
DECLARE v_is_owner boolean;
BEGIN
  IF NEW.barber_id IS DISTINCT FROM OLD.barber_id
     AND EXISTS (SELECT 1 FROM public.fixed_monthly_plans p
                 WHERE p.shop_id=OLD.shop_id AND p.fixed_booking_id=OLD.id) THEN
    SELECT is_owner INTO v_is_owner
    FROM public.barbers WHERE id=NEW.barber_id AND shop_id=NEW.shop_id;
    IF v_is_owner IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Este fijo tiene un abono: no se puede trasladar a un barbero con comisión'
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_fixed_monthly_fixed_owner BEFORE UPDATE ON public.fixed_bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_fixed_monthly_fixed_owner();

-- Proteger el historial (no hacer borrados físicos ni cambios retrospectivos).
CREATE FUNCTION public.guard_fixed_monthly_history()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog','public' AS $$
BEGIN
  RAISE EXCEPTION 'El historial de abonos es inmutable; requiere conciliación administrativa' USING ERRCODE='23514';
END; $$;
CREATE TRIGGER trg_fixed_monthly_periods_immutable BEFORE UPDATE OR DELETE ON public.fixed_monthly_periods
  FOR EACH ROW EXECUTE FUNCTION public.guard_fixed_monthly_history();
CREATE TRIGGER trg_fixed_monthly_uses_immutable BEFORE UPDATE OR DELETE ON public.fixed_monthly_uses
  FOR EACH ROW EXECUTE FUNCTION public.guard_fixed_monthly_history();

-- El movimiento financiero que respalda una mensualidad también es inmutable.
CREATE FUNCTION public.guard_fixed_monthly_charge_history()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog','public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fixed_monthly_periods p
             WHERE p.shop_id=OLD.shop_id AND p.manual_charge_id=OLD.id) THEN
    RAISE EXCEPTION 'El cobro de una mensualidad es inmutable; requiere conciliación administrativa'
      USING ERRCODE='23514';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
CREATE TRIGGER trg_guard_fixed_monthly_charge_history
  BEFORE UPDATE OR DELETE ON public.manual_charges
  FOR EACH ROW EXECUTE FUNCTION public.guard_fixed_monthly_charge_history();

-- La operación de cobro usa manual_charges para que caja, transferencias y cierres
-- sigan sumando exactamente un ingreso, con snapshot de comisión dueño=0%.
CREATE FUNCTION public.pay_fixed_monthly_period(
  p_shop_id uuid,p_fixed_id uuid,p_month date,p_method text
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','public' AS $$
DECLARE v_fixed public.fixed_bookings%ROWTYPE;v_plan public.fixed_monthly_plans%ROWTYPE;
        v_charge uuid;v_period uuid;v_owner boolean;v_barber_active boolean;
        v_now date := (clock_timestamp() AT TIME ZONE 'America/Montevideo')::date;
BEGIN
  IF p_month IS NULL OR extract(day from p_month) <> 1 OR
     p_month <> date_trunc('month',v_now)::date OR p_method NOT IN ('cash','transfer')
     OR p_shop_id IS NULL OR p_fixed_id IS NULL THEN
    RAISE EXCEPTION 'Período o método de pago inválido' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_fixed FROM public.fixed_bookings
  WHERE id=p_fixed_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND OR NOT v_fixed.active THEN
    RAISE EXCEPTION 'Turno fijo no disponible' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_plan FROM public.fixed_monthly_plans
  WHERE fixed_booking_id=p_fixed_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND OR NOT v_plan.active THEN
    RAISE EXCEPTION 'Abono mensual inactivo' USING ERRCODE='23514';
  END IF;
  SELECT is_owner,active INTO v_owner,v_barber_active FROM public.barbers
  WHERE id=v_fixed.barber_id AND shop_id=p_shop_id;
  IF v_owner IS DISTINCT FROM true OR v_barber_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'El abono solo puede usarlo el dueño sin comisión' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.fixed_monthly_periods
     WHERE shop_id=p_shop_id AND fixed_booking_id=p_fixed_id AND period_month=p_month) THEN
    RAISE EXCEPTION 'Este abono mensual ya fue cobrado' USING ERRCODE='23505';
  END IF;
  -- Evitar cobrar la mensualidad además de cortes que ya fueron facturados ese mes.
  IF EXISTS(SELECT 1 FROM public.manual_charges WHERE shop_id=p_shop_id
       AND fixed_booking_id=p_fixed_id AND fixed_occurrence_date>=p_month
       AND fixed_occurrence_date < (p_month+interval '1 month')::date) THEN
    RAISE EXCEPTION 'Hay cortes individuales ya cobrados este mes: requiere conciliación'
      USING ERRCODE='23514';
  END IF;
  PERFORM public.cash_register_for_finance(p_shop_id);
  INSERT INTO public.manual_charges(shop_id,barber_id,amount,note,date_string,payment_method)
  VALUES(p_shop_id,v_fixed.barber_id,v_plan.monthly_price,
    left('Abono mensual · '||v_fixed.client_name||' · '||to_char(p_month,'YYYY-MM'),300),
    public.booking_display_label(v_now),p_method)
  RETURNING id INTO v_charge;
  INSERT INTO public.fixed_monthly_periods
    (shop_id,fixed_booking_id,period_month,price_snapshot,payment_method,manual_charge_id)
  VALUES(p_shop_id,p_fixed_id,p_month,v_plan.monthly_price,p_method,v_charge)
  RETURNING id INTO v_period;
  RETURN v_period;
END; $$;

-- La ruta de corte abonado sólo crea un uso: jamás un movimiento monetario.
CREATE FUNCTION public.complete_fixed_monthly_occurrence(
  p_shop_id uuid,p_fixed_id uuid,p_occurrence date
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','public' AS $$
DECLARE v_fixed public.fixed_bookings%ROWTYPE; v_period public.fixed_monthly_periods%ROWTYPE;
        v_cut uuid;v_used integer;v_now timestamp := clock_timestamp() AT TIME ZONE 'America/Montevideo';
BEGIN
  IF p_shop_id IS NULL OR p_fixed_id IS NULL OR p_occurrence IS NULL THEN
    RAISE EXCEPTION 'Datos de corte inválidos' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_fixed FROM public.fixed_bookings
  WHERE id=p_fixed_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND OR NOT v_fixed.active OR p_occurrence<v_fixed.start_date
    OR (v_fixed.end_date IS NOT NULL AND p_occurrence>v_fixed.end_date)
    OR extract(dow from p_occurrence)::int<>v_fixed.weekday
    OR p_occurrence=ANY(v_fixed.skipped_dates)
    OR p_occurrence>v_now::date
    OR (p_occurrence=v_now::date AND v_fixed.time_slot::time>v_now::time) THEN
    RAISE EXCEPTION 'El turno fijo no corresponde a una fecha completada' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.barbers b
     WHERE b.id=v_fixed.barber_id AND b.shop_id=p_shop_id AND b.is_owner=true AND b.active=true) THEN
    RAISE EXCEPTION 'El abono sólo corresponde al dueño activo' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.manual_charges WHERE shop_id=p_shop_id
     AND fixed_booking_id=p_fixed_id AND fixed_occurrence_date=p_occurrence)
     OR EXISTS(SELECT 1 FROM public.fixed_monthly_uses WHERE shop_id=p_shop_id
     AND fixed_booking_id=p_fixed_id AND occurrence_date=p_occurrence) THEN
    RAISE EXCEPTION 'Esta atención ya fue registrada' USING ERRCODE='23505';
  END IF;
  SELECT * INTO v_period FROM public.fixed_monthly_periods
  WHERE shop_id=p_shop_id AND fixed_booking_id=p_fixed_id
    AND period_month=date_trunc('month',p_occurrence)::date FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El mes no está pagado: no se puede descontar el abono' USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO v_used FROM public.fixed_monthly_uses
  WHERE period_id=v_period.id AND shop_id=p_shop_id;
  IF v_used>=v_period.included_cuts THEN
    RAISE EXCEPTION 'Se agotaron los cuatro cortes del mes' USING ERRCODE='23514';
  END IF;
  PERFORM public.cash_register_for_finance(p_shop_id);
  INSERT INTO public.fixed_monthly_uses(shop_id,fixed_booking_id,period_id,occurrence_date)
  VALUES(p_shop_id,p_fixed_id,v_period.id,p_occurrence) RETURNING id INTO v_cut;
  RETURN v_cut;
END; $$;

-- Blindar la función actual contra cobros duplicados, conservando su firma.
CREATE OR REPLACE FUNCTION public.complete_fixed_booking_occurrence(
  p_shop_id uuid,p_fixed_id uuid,p_occurrence date,p_payment_method text
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','public' AS $$
DECLARE v_fixed public.fixed_bookings%ROWTYPE;
        v_date_now timestamp := clock_timestamp() AT TIME ZONE 'America/Montevideo';
        v_price numeric;v_service text;v_charge uuid;v_period public.fixed_monthly_periods%ROWTYPE;
        v_used integer;
BEGIN
  IF p_shop_id IS NULL OR p_fixed_id IS NULL OR p_occurrence IS NULL
     OR p_payment_method NOT IN ('cash','transfer') OR p_payment_method IS NULL THEN
    RAISE EXCEPTION 'Datos de cobro inválidos' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_fixed FROM public.fixed_bookings
  WHERE id=p_fixed_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND OR NOT v_fixed.active OR p_occurrence<v_fixed.start_date
      OR (v_fixed.end_date IS NOT NULL AND p_occurrence>v_fixed.end_date)
      OR extract(dow from p_occurrence)::int<>v_fixed.weekday
      OR p_occurrence=ANY(v_fixed.skipped_dates) THEN
    RAISE EXCEPTION 'El turno fijo no corresponde a la fecha elegida' USING ERRCODE='23514';
  END IF;
  IF p_occurrence>v_date_now::date OR
     (p_occurrence=v_date_now::date AND v_fixed.time_slot::time>v_date_now::time) THEN
    RAISE EXCEPTION 'Todavía no comenzó este turno' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.manual_charges WHERE shop_id=p_shop_id
    AND fixed_booking_id=p_fixed_id AND fixed_occurrence_date=p_occurrence)
    OR EXISTS(SELECT 1 FROM public.fixed_monthly_uses WHERE shop_id=p_shop_id
    AND fixed_booking_id=p_fixed_id AND occurrence_date=p_occurrence) THEN
    RAISE EXCEPTION 'Esta fecha ya fue completada' USING ERRCODE='23505';
  END IF;
  SELECT * INTO v_period FROM public.fixed_monthly_periods
  WHERE shop_id=p_shop_id AND fixed_booking_id=p_fixed_id
    AND period_month=date_trunc('month',p_occurrence)::date FOR SHARE;
  IF FOUND THEN
    SELECT count(*) INTO v_used FROM public.fixed_monthly_uses
    WHERE period_id=v_period.id AND shop_id=p_shop_id;
    IF v_used<v_period.included_cuts THEN
      RAISE EXCEPTION 'Corte cubierto por un abono: no se cobra nuevamente' USING ERRCODE='23514';
    END IF;
  END IF;
  SELECT s.price,s.name INTO v_price,v_service FROM public.services s
  WHERE s.id=v_fixed.service_id AND s.shop_id=p_shop_id;
  IF NOT FOUND OR v_price IS NULL OR v_price<=0 THEN
    RAISE EXCEPTION 'No hay precio válido para el servicio' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.barbers b
     WHERE b.id=v_fixed.barber_id AND b.shop_id=p_shop_id AND b.active) THEN
    RAISE EXCEPTION 'Barbero no disponible' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.manual_charges(
    shop_id,barber_id,amount,note,date_string,payment_method,
    fixed_booking_id,fixed_occurrence_date
  ) VALUES (
    p_shop_id,v_fixed.barber_id,v_price,
    left('Turno fijo · '||v_fixed.client_name||' · '||v_service||' · '||p_occurrence::text,300),
    public.booking_display_label(p_occurrence),p_payment_method,p_fixed_id,p_occurrence
  ) RETURNING id INTO v_charge;
  RETURN v_charge;
END; $$;

REVOKE ALL ON FUNCTION public.pay_fixed_monthly_period(uuid,uuid,date,text),
  public.complete_fixed_monthly_occurrence(uuid,uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pay_fixed_monthly_period(uuid,uuid,date,text),
  public.complete_fixed_monthly_occurrence(uuid,uuid,date) TO service_role;
REVOKE ALL ON FUNCTION public.guard_fixed_monthly_plan_owner(),
  public.guard_fixed_monthly_fixed_owner(),public.guard_fixed_monthly_history(),
  public.guard_fixed_monthly_charge_history()
  FROM PUBLIC,anon,authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
