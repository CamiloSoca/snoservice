-- Monthly prepaid services also work for commissioned barbers.
-- Existing owner-only plans, paid periods and cash drawer movements are preserved.
-- Commissions accrue when the covered haircut is performed, not at prepayment.

ALTER TABLE public.manual_charges
  ADD COLUMN IF NOT EXISTS monthly_prepaid boolean NOT NULL DEFAULT false;

ALTER TABLE public.fixed_monthly_periods
  ALTER COLUMN manual_charge_id DROP NOT NULL;
ALTER TABLE public.fixed_monthly_periods
  ADD COLUMN IF NOT EXISTS payment_source text NOT NULL DEFAULT 'live_drawer';
ALTER TABLE public.fixed_monthly_periods
  DROP CONSTRAINT IF EXISTS fixed_monthly_periods_payment_method_check;
ALTER TABLE public.fixed_monthly_periods
  ADD CONSTRAINT fixed_monthly_periods_payment_method_check
  CHECK (payment_method IN ('cash','transfer','unknown'));
ALTER TABLE public.fixed_monthly_periods
  ADD CONSTRAINT fixed_monthly_payment_source_check
  CHECK (
    (payment_source='live_drawer' AND manual_charge_id IS NOT NULL
      AND payment_method IN ('cash','transfer'))
    OR
    (payment_source='historical_off_drawer' AND manual_charge_id IS NULL
      AND payment_method='unknown')
  );

ALTER TABLE public.fixed_monthly_uses
  ADD COLUMN IF NOT EXISTS commission_rate_snapshot numeric NOT NULL DEFAULT 0;
ALTER TABLE public.fixed_monthly_uses
  ADD COLUMN IF NOT EXISTS barber_earnings_snapshot numeric NOT NULL DEFAULT 0;
ALTER TABLE public.fixed_monthly_uses
  ADD CONSTRAINT fixed_monthly_use_commission_check
  CHECK (commission_rate_snapshot BETWEEN 0 AND 100 AND barber_earnings_snapshot>=0);

-- An abono cannot silently move to another barber after it was configured.
CREATE OR REPLACE FUNCTION public.guard_fixed_monthly_fixed_owner()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public'
AS $function$
BEGIN
  IF NEW.barber_id IS DISTINCT FROM OLD.barber_id
    AND EXISTS(SELECT 1 FROM public.fixed_monthly_plans p
      WHERE p.shop_id=OLD.shop_id AND p.fixed_booking_id=OLD.id) THEN
    RAISE EXCEPTION 'No se puede cambiar el barbero de un fijo con abono. Desactivá y conciliá el plan.'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $function$;

-- Previously monthly plans could only be assigned to an owner.
CREATE OR REPLACE FUNCTION public.guard_fixed_monthly_plan_owner()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE v_active boolean;v_courtesy boolean;
BEGIN
  SELECT b.active,f.complimentary INTO v_active,v_courtesy
  FROM public.fixed_bookings f JOIN public.barbers b
    ON b.id=f.barber_id AND b.shop_id=f.shop_id
  WHERE f.id=NEW.fixed_booking_id AND f.shop_id=NEW.shop_id;
  IF NOT FOUND OR v_active IS DISTINCT FROM true OR v_courtesy IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'El abono requiere un fijo activo, un barbero activo y no ser cortesía'
      USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.shop_id IS DISTINCT FROM OLD.shop_id
      OR NEW.fixed_booking_id IS DISTINCT FROM OLD.fixed_booking_id THEN
      RAISE EXCEPTION 'No se puede reasignar un abono' USING ERRCODE='23514';
    END IF;
    NEW.updated_at:=now();
  END IF;
  RETURN NEW;
END; $function$;

-- Monthly prepayments represent the one-and-only revenue receipt, but are
-- NOT an earned barber commission until each of the 4 cuts is performed.
CREATE OR REPLACE FUNCTION public.snapshot_manual_charge_finances()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE v_owner boolean;v_rate numeric;v_register uuid;
BEGIN
  SELECT b.is_owner,b.commission_rate INTO v_owner,v_rate
  FROM public.barbers b WHERE b.id=NEW.barber_id AND b.shop_id=NEW.shop_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barbero inexistente en este negocio' USING ERRCODE='23514';
  END IF;
  IF NEW.amount IS NULL OR NEW.amount<=0 OR v_rate NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'Monto o comisión fuera de rango' USING ERRCODE='23514';
  END IF;
  IF NEW.monthly_prepaid
     AND coalesce(NEW.note,'') NOT LIKE 'Abono mensual · %' THEN
    RAISE EXCEPTION 'El anticipo mensual requiere la descripción de abono' USING ERRCODE='23514';
  END IF;
  SELECT c.id INTO v_register
  FROM public.cash_registers c
  WHERE c.shop_id=NEW.shop_id AND c.status='abierta'
  ORDER BY c.opened_at DESC LIMIT 1;
  IF v_register IS NULL THEN
    RAISE EXCEPTION 'Abrí la caja antes de registrar cobros' USING ERRCODE='23514';
  END IF;
  NEW.cash_register_id:=v_register;
  NEW.commission_rate_snapshot:=CASE WHEN v_owner OR NEW.monthly_prepaid THEN 0 ELSE v_rate END;
  NEW.barber_earnings_snapshot:=round(NEW.amount*NEW.commission_rate_snapshot/100,2);
  NEW.business_earnings_snapshot:=NEW.amount-NEW.barber_earnings_snapshot;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.guard_monthly_prepaid_immutable()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public'
AS $function$
BEGIN
  IF NEW.monthly_prepaid IS DISTINCT FROM OLD.monthly_prepaid THEN
    RAISE EXCEPTION 'No se puede cambiar el tipo de un cobro existente'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $function$;
DROP TRIGGER IF EXISTS trg_monthly_prepaid_immutable ON public.manual_charges;
CREATE TRIGGER trg_monthly_prepaid_immutable
BEFORE UPDATE OF monthly_prepaid ON public.manual_charges
FOR EACH ROW EXECUTE FUNCTION public.guard_monthly_prepaid_immutable();

-- Live drawer: one payment per fixed booking/month, no accrued commission yet.
CREATE OR REPLACE FUNCTION public.pay_fixed_monthly_period(
  p_shop_id uuid,p_fixed_id uuid,p_month date,p_method text
) RETURNS uuid LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE v_fixed public.fixed_bookings%ROWTYPE;
        v_plan public.fixed_monthly_plans%ROWTYPE;
        v_charge uuid;v_period uuid;v_active boolean;
        v_now date:=(clock_timestamp() AT TIME ZONE 'America/Montevideo')::date;
BEGIN
  IF p_shop_id IS NULL OR p_fixed_id IS NULL
     OR p_month IS NULL OR extract(day FROM p_month)<>1
     OR p_month<>date_trunc('month',v_now)::date
     OR p_method NOT IN ('cash','transfer') OR p_method IS NULL THEN
    RAISE EXCEPTION 'Período o método de pago inválido' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_fixed FROM public.fixed_bookings
    WHERE id=p_fixed_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND OR NOT v_fixed.active OR v_fixed.complimentary THEN
    RAISE EXCEPTION 'Turno fijo no disponible' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_plan FROM public.fixed_monthly_plans
    WHERE fixed_booking_id=p_fixed_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND OR NOT v_plan.active THEN
    RAISE EXCEPTION 'Abono mensual inactivo' USING ERRCODE='23514';
  END IF;
  SELECT active INTO v_active FROM public.barbers
    WHERE id=v_fixed.barber_id AND shop_id=p_shop_id;
  IF v_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Barbero no disponible' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fixed_monthly_periods
      WHERE shop_id=p_shop_id AND fixed_booking_id=p_fixed_id AND period_month=p_month) THEN
    RAISE EXCEPTION 'Este abono mensual ya fue cobrado' USING ERRCODE='23505';
  END IF;
  IF EXISTS(SELECT 1 FROM public.manual_charges
       WHERE shop_id=p_shop_id AND fixed_booking_id=p_fixed_id
         AND fixed_occurrence_date>=p_month
         AND fixed_occurrence_date<(p_month+interval '1 month')::date) THEN
    RAISE EXCEPTION 'Hay cortes individuales ya cobrados este mes: requiere conciliación'
      USING ERRCODE='23514';
  END IF;
  PERFORM public.cash_register_for_finance(p_shop_id);
  INSERT INTO public.manual_charges
    (shop_id,barber_id,amount,note,date_string,payment_method,monthly_prepaid)
  VALUES (p_shop_id,v_fixed.barber_id,v_plan.monthly_price,
    left('Abono mensual · '||v_fixed.client_name||' · '||to_char(p_month,'YYYY-MM'),300),
    public.booking_display_label(v_now),p_method,true)
  RETURNING id INTO v_charge;
  INSERT INTO public.fixed_monthly_periods
    (shop_id,fixed_booking_id,period_month,price_snapshot,included_cuts,
     payment_method,manual_charge_id,payment_source)
  VALUES (p_shop_id,p_fixed_id,p_month,v_plan.monthly_price,v_plan.included_cuts,
    p_method,v_charge,'live_drawer')
  RETURNING id INTO v_period;
  RETURN v_period;
END; $function$;

-- Off-drawer recording is ADMIN-only through the server API.
-- It confirms an already-paid plan without pretending money entered today's
-- drawer. The actual payment method/date were not provided, so no fiction.
CREATE OR REPLACE FUNCTION public.record_fixed_monthly_paid_off_drawer(
  p_shop_id uuid,p_fixed_id uuid,p_month date,p_amount numeric
) RETURNS uuid LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE v_fixed public.fixed_bookings%ROWTYPE;
        v_plan public.fixed_monthly_plans%ROWTYPE;
        v_period uuid;v_active boolean;
        v_now date:=(clock_timestamp() AT TIME ZONE 'America/Montevideo')::date;
BEGIN
  IF p_shop_id IS NULL OR p_fixed_id IS NULL OR p_month IS NULL
    OR extract(day FROM p_month)<>1 OR p_month<>date_trunc('month',v_now)::date
    OR p_amount IS NULL OR p_amount<=0 THEN
    RAISE EXCEPTION 'Período o importe inválido' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_fixed FROM public.fixed_bookings
    WHERE id=p_fixed_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND OR NOT v_fixed.active OR v_fixed.complimentary THEN
    RAISE EXCEPTION 'Turno fijo inválido o de cortesía' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_plan FROM public.fixed_monthly_plans
    WHERE fixed_booking_id=p_fixed_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND OR NOT v_plan.active OR v_plan.monthly_price<>p_amount THEN
    RAISE EXCEPTION 'El importe no coincide con el abono mensual activo'
      USING ERRCODE='23514';
  END IF;
  SELECT active INTO v_active FROM public.barbers
    WHERE id=v_fixed.barber_id AND shop_id=p_shop_id;
  IF v_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Barbero no disponible' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fixed_monthly_periods
    WHERE shop_id=p_shop_id AND fixed_booking_id=p_fixed_id AND period_month=p_month) THEN
    RAISE EXCEPTION 'El mes ya figura pagado' USING ERRCODE='23505';
  END IF;
  IF EXISTS(SELECT 1 FROM public.manual_charges
      WHERE shop_id=p_shop_id AND fixed_booking_id=p_fixed_id
        AND fixed_occurrence_date>=p_month
        AND fixed_occurrence_date<(p_month+interval '1 month')::date) THEN
    RAISE EXCEPTION 'Hay cortes individuales cobrados: requiere conciliación'
      USING ERRCODE='23514';
  END IF;
  INSERT INTO public.fixed_monthly_periods
    (shop_id,fixed_booking_id,period_month,price_snapshot,included_cuts,
     payment_method,manual_charge_id,payment_source)
  VALUES (p_shop_id,p_fixed_id,p_month,v_plan.monthly_price,v_plan.included_cuts,
     'unknown',NULL,'historical_off_drawer')
  RETURNING id INTO v_period;
  INSERT INTO public.audit_logs(shop_id,action,details)
  VALUES(p_shop_id,'FIXED_MONTHLY_ALREADY_PAID_OFF_DRAWER',
    left('Abono '||p_month::text||': '||v_fixed.client_name||
      ' · importe '||p_amount::text||
      ' informado como pagado. Asiento sin caja ni método de pago confirmado; ID '||
      v_period::text,1000));
  RETURN v_period;
END; $function$;
REVOKE ALL ON FUNCTION public.record_fixed_monthly_paid_off_drawer(uuid,uuid,date,numeric)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_fixed_monthly_paid_off_drawer(uuid,uuid,date,numeric)
  TO service_role;

-- A covered cut never records money a second time. It accrues one of four
-- precise installments of the barber's TOTAL frozen per-cut entitlement.
CREATE OR REPLACE FUNCTION public.complete_fixed_monthly_occurrence(
  p_shop_id uuid,p_fixed_id uuid,p_occurrence date
) RETURNS uuid LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE v_fixed public.fixed_bookings%ROWTYPE;
        v_period public.fixed_monthly_periods%ROWTYPE;
        v_cut uuid;v_used integer;
        v_now timestamp:=clock_timestamp() AT TIME ZONE 'America/Montevideo';
        v_is_owner boolean;v_rate numeric;v_total numeric;v_each numeric;v_share numeric;
BEGIN
  IF p_shop_id IS NULL OR p_fixed_id IS NULL OR p_occurrence IS NULL THEN
    RAISE EXCEPTION 'Datos de corte inválidos' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_fixed FROM public.fixed_bookings
    WHERE id=p_fixed_id AND shop_id=p_shop_id FOR UPDATE;
  IF NOT FOUND OR NOT v_fixed.active OR v_fixed.complimentary
    OR p_occurrence<v_fixed.start_date
    OR (v_fixed.end_date IS NOT NULL AND p_occurrence>v_fixed.end_date)
    OR extract(dow FROM p_occurrence)::int<>v_fixed.weekday
    OR p_occurrence=ANY(v_fixed.skipped_dates)
    OR p_occurrence>v_now::date
    OR (p_occurrence=v_now::date AND v_fixed.time_slot::time>v_now::time) THEN
    RAISE EXCEPTION 'El turno fijo no corresponde a una fecha completada'
      USING ERRCODE='23514';
  END IF;
  SELECT b.is_owner,b.commission_rate INTO v_is_owner,v_rate
    FROM public.barbers b WHERE b.id=v_fixed.barber_id
       AND b.shop_id=p_shop_id AND b.active=true;
  IF NOT FOUND OR v_rate NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'Barbero no disponible o comisión inválida' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.manual_charges
      WHERE shop_id=p_shop_id AND fixed_booking_id=p_fixed_id
      AND fixed_occurrence_date=p_occurrence)
    OR EXISTS(SELECT 1 FROM public.fixed_monthly_uses
      WHERE shop_id=p_shop_id AND fixed_booking_id=p_fixed_id
      AND occurrence_date=p_occurrence)
    OR EXISTS(SELECT 1 FROM public.fixed_courtesy_uses
      WHERE shop_id=p_shop_id AND fixed_booking_id=p_fixed_id
      AND occurrence_date=p_occurrence) THEN
    RAISE EXCEPTION 'Esta atención ya fue registrada' USING ERRCODE='23505';
  END IF;
  SELECT * INTO v_period FROM public.fixed_monthly_periods
    WHERE shop_id=p_shop_id AND fixed_booking_id=p_fixed_id
      AND period_month=date_trunc('month',p_occurrence)::date FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El mes no está pagado: no se puede descontar el abono'
      USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO v_used FROM public.fixed_monthly_uses
    WHERE period_id=v_period.id AND shop_id=p_shop_id;
  IF v_used>=v_period.included_cuts THEN
    RAISE EXCEPTION 'Se agotaron los cuatro cortes del mes' USING ERRCODE='23514';
  END IF;
  v_rate:=CASE WHEN v_is_owner THEN 0 ELSE v_rate END;
  v_total:=round(v_period.price_snapshot*v_rate/100,2);
  v_each:=round(v_total/v_period.included_cuts,2);
  v_share:=CASE WHEN v_used=v_period.included_cuts-1
                THEN v_total-v_each*v_used ELSE v_each END;
  PERFORM public.cash_register_for_finance(p_shop_id);
  INSERT INTO public.fixed_monthly_uses(
    shop_id,fixed_booking_id,period_id,occurrence_date,
    commission_rate_snapshot,barber_earnings_snapshot
  ) VALUES (
    p_shop_id,p_fixed_id,v_period.id,p_occurrence,v_rate,v_share
  ) RETURNING id INTO v_cut;
  RETURN v_cut;
END; $function$;

-- Sum commissions on prepaid cuts, but never count the original payment as
-- a second earned barber amount. Payouts still subtract exactly once.
CREATE OR REPLACE FUNCTION public.finance_barber_balances(
  p_shop_id uuid,p_barber_id uuid DEFAULT NULL::uuid
) RETURNS TABLE(
 barber_id uuid,barber_name text,is_owner boolean,earned numeric,paid numeric,outstanding numeric
) LANGUAGE sql STABLE
SET search_path TO 'pg_catalog','public'
AS $function$
  WITH e AS (
    SELECT a.barber_id,coalesce(sum(a.barber_earnings_snapshot),0) amount
      FROM public.appointments a
      WHERE a.shop_id=p_shop_id AND a.status='completado' GROUP BY a.barber_id
    UNION ALL
    SELECT m.barber_id,coalesce(sum(m.barber_earnings_snapshot),0)
      FROM public.manual_charges m
      WHERE m.shop_id=p_shop_id GROUP BY m.barber_id
    UNION ALL
    SELECT t.barber_id,coalesce(sum(t.amount),0)
      FROM public.tips t
      WHERE t.shop_id=p_shop_id GROUP BY t.barber_id
    UNION ALL
    SELECT f.barber_id,coalesce(sum(u.barber_earnings_snapshot),0)
      FROM public.fixed_monthly_uses u
      JOIN public.fixed_bookings f
        ON f.shop_id=u.shop_id AND f.id=u.fixed_booking_id
      WHERE u.shop_id=p_shop_id GROUP BY f.barber_id
  ), totals AS (
    SELECT e.barber_id,round(coalesce(sum(e.amount),0),2) earned
      FROM e GROUP BY e.barber_id
  ), payments AS (
    SELECT p.barber_id,round(coalesce(sum(p.amount),0),2) paid
      FROM public.barber_payouts p
      WHERE p.shop_id=p_shop_id GROUP BY p.barber_id
  )
  SELECT b.id,b.name,b.is_owner,
    CASE WHEN b.is_owner THEN 0::numeric ELSE coalesce(t.earned,0) END,
    coalesce(p.paid,0),
    CASE WHEN b.is_owner THEN 0::numeric ELSE coalesce(t.earned,0)-coalesce(p.paid,0) END
  FROM public.barbers b
  LEFT JOIN totals t ON t.barber_id=b.id
  LEFT JOIN payments p ON p.barber_id=b.id
  WHERE b.shop_id=p_shop_id AND (p_barber_id IS NULL OR b.id=p_barber_id)
  ORDER BY b.name;
$function$;
