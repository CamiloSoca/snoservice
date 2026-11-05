
-- Monthly commissions accrue when the prepaid plan is recorded, not on each haircut.
-- The cashier explicitly confirms actual payouts on Saturdays.
CREATE TABLE IF NOT EXISTS public.barber_monthly_commissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 shop_id uuid NOT NULL REFERENCES public.shops(id),
 fixed_booking_id uuid NOT NULL REFERENCES public.fixed_bookings(id),
 period_id uuid NOT NULL UNIQUE REFERENCES public.fixed_monthly_periods(id),
 barber_id uuid NOT NULL REFERENCES public.barbers(id),
 period_month date NOT NULL,
 base_amount numeric NOT NULL CHECK (base_amount>0),
 commission_rate_snapshot numeric NOT NULL CHECK (commission_rate_snapshot BETWEEN 0 AND 100),
 amount numeric NOT NULL CHECK (amount>=0),
 earned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_barber_monthly_commissions_barber
 ON public.barber_monthly_commissions(shop_id,barber_id,earned_at);
ALTER TABLE public.barber_monthly_commissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.barber_monthly_commissions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.barber_monthly_commissions TO service_role;
CREATE TRIGGER trg_barber_monthly_commissions_immutable
 BEFORE UPDATE OR DELETE ON public.barber_monthly_commissions
 FOR EACH ROW EXECUTE FUNCTION public.guard_fixed_monthly_history();

-- Stop rather than double-allocate any previously earned commissioned cuts.
DO $$
BEGIN
 IF EXISTS (
   SELECT 1 FROM public.fixed_monthly_uses u
   JOIN public.fixed_bookings f ON f.id=u.fixed_booking_id
   JOIN public.barbers b ON b.id=f.barber_id
   WHERE b.is_owner=false AND u.barber_earnings_snapshot>0
 ) THEN
   RAISE EXCEPTION 'Comisiones de abonos previas pendientes de conciliacion';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.snapshot_prepaid_monthly_commission()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE v_barber uuid; v_rate numeric; v_is_owner boolean;
BEGIN
 SELECT b.id,b.commission_rate,b.is_owner
   INTO v_barber,v_rate,v_is_owner
 FROM public.fixed_bookings f JOIN public.barbers b
   ON b.id=f.barber_id AND b.shop_id=f.shop_id
 WHERE f.id=NEW.fixed_booking_id AND f.shop_id=NEW.shop_id;
 IF NOT FOUND OR v_rate NOT BETWEEN 0 AND 100 THEN
   RAISE EXCEPTION 'Abono sin barbero o tasa de comision valida';
 END IF;
 IF NOT v_is_owner THEN
   INSERT INTO public.barber_monthly_commissions
     (shop_id,fixed_booking_id,period_id,barber_id,period_month,
      base_amount,commission_rate_snapshot,amount,earned_at)
   VALUES (NEW.shop_id,NEW.fixed_booking_id,NEW.id,v_barber,NEW.period_month,
     NEW.price_snapshot,v_rate,round(NEW.price_snapshot*v_rate/100,2),NEW.paid_at);
 END IF;
 RETURN NEW;
END; $fn$;
REVOKE ALL ON FUNCTION public.snapshot_prepaid_monthly_commission()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_prepaid_monthly_commission()
 TO service_role;
CREATE TRIGGER trg_snapshot_prepaid_monthly_commission
 AFTER INSERT ON public.fixed_monthly_periods
 FOR EACH ROW EXECUTE FUNCTION public.snapshot_prepaid_monthly_commission();

-- Backfill the recorded November subscription, without another cash receipt.
INSERT INTO public.barber_monthly_commissions
 (shop_id,fixed_booking_id,period_id,barber_id,period_month,
  base_amount,commission_rate_snapshot,amount,earned_at)
SELECT p.shop_id,p.fixed_booking_id,p.id,b.id,p.period_month,
       p.price_snapshot,b.commission_rate,
       round(p.price_snapshot*b.commission_rate/100,2),p.paid_at
 FROM public.fixed_monthly_periods p
 JOIN public.fixed_bookings f ON f.id=p.fixed_booking_id AND f.shop_id=p.shop_id
 JOIN public.barbers b ON b.id=f.barber_id AND b.shop_id=f.shop_id
 WHERE b.is_owner=false
 ON CONFLICT (period_id) DO NOTHING;

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
  -- La comision mensual completa ya se acredito con el abono.
  -- Los cortes solo consumen cupo, sin comision adicional.
  v_rate:=0;
  v_share:=0;
  PERFORM public.cash_register_for_finance(p_shop_id);
  INSERT INTO public.fixed_monthly_uses(
    shop_id,fixed_booking_id,period_id,occurrence_date,
    commission_rate_snapshot,barber_earnings_snapshot
  ) VALUES (
    p_shop_id,p_fixed_id,v_period.id,p_occurrence,v_rate,v_share
  ) RETURNING id INTO v_cut;
  RETURN v_cut;
END; $function$;

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
    SELECT mc.barber_id, coalesce(sum(mc.amount),0)
      FROM public.barber_monthly_commissions mc
      WHERE mc.shop_id=p_shop_id GROUP BY mc.barber_id
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
