-- Alinea STAGING con la validación del código local: no cobrar un plan si el
-- barbero dueño fue desactivado. No modifica pagos ni períodos existentes.
CREATE OR REPLACE FUNCTION public.pay_fixed_monthly_period(
  p_shop_id uuid,p_fixed_id uuid,p_month date,p_method text
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','public' AS $$
DECLARE
  v_fixed public.fixed_bookings%ROWTYPE;
  v_plan public.fixed_monthly_plans%ROWTYPE;
  v_charge uuid;
  v_period uuid;
  v_owner boolean;
  v_barber_active boolean;
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
    RAISE EXCEPTION 'El abono solo puede usarlo el dueño activo sin comisión' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.fixed_monthly_periods
     WHERE shop_id=p_shop_id AND fixed_booking_id=p_fixed_id AND period_month=p_month) THEN
    RAISE EXCEPTION 'Este abono mensual ya fue cobrado' USING ERRCODE='23505';
  END IF;
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

REVOKE ALL ON FUNCTION public.pay_fixed_monthly_period(uuid,uuid,date,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pay_fixed_monthly_period(uuid,uuid,date,text)
  TO service_role;
