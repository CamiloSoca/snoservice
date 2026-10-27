-- Prueba transaccional solo para QA_E2E_Barberia en STAGING.
-- No crea historial persistente: el bloque completo termina en ROLLBACK.
BEGIN;
DO $qa$
DECLARE
  v_shop uuid := 'ad8b26a7-b1a6-41b0-a7ce-1610f8315824';
  v_fixed uuid; v_october_fixed uuid; v_owner uuid; v_service uuid; v_period uuid; v_charge uuid;
  v_today date := (clock_timestamp() AT TIME ZONE 'America/Montevideo')::date;
  v_month date := date_trunc('month',v_today)::date;
  v_sunday date; v_day date; v_count integer; v_base_charges integer;
  v_i integer; v_rejected boolean := false; v_price numeric;
  v_past_month date := date '2026-08-01'; v_fifth_sunday date := date '2026-08-30';
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.shops WHERE id=v_shop AND name='QA_E2E_Barberia') THEN
    RAISE EXCEPTION 'Shop QA no coincide; se aborta sin escribir';
  END IF;
  IF v_today < date '2026-10-26' OR v_today >= date '2026-11-01' THEN
    RAISE EXCEPTION 'Este fixture requiere octubre de 2026 en America/Montevideo';
  END IF;
  SELECT id INTO STRICT v_owner FROM public.barbers
    WHERE shop_id=v_shop AND is_owner=true AND active=true;
  SELECT id INTO STRICT v_service FROM public.services
    WHERE shop_id=v_shop AND name='QA_E2E_Corte_30' AND active=true;
  v_price:=2000;

  -- El jueves 10:00 está dentro del horario QA y sin reservas en los próximos
  -- 30 días; se usa el fixture temporal para no tocar el historial previo.
  INSERT INTO public.fixed_bookings(shop_id,barber_id,service_id,client_name,
      client_phone,client_email,weekday,time_slot,duration_minutes,start_date,active)
    VALUES(v_shop,v_owner,v_service,'QA_ABONOS_STRESS Mensual rollback','','',4,
      '10:00',30,v_month,true) RETURNING id INTO v_fixed;
  v_october_fixed:=v_fixed;
  INSERT INTO public.fixed_monthly_plans(shop_id,fixed_booking_id,monthly_price)
    VALUES(v_shop,v_fixed,v_price);

  -- La caja temporal forma parte de esta transacción y desaparece por rollback.
  IF NOT EXISTS(SELECT 1 FROM public.cash_registers WHERE shop_id=v_shop AND status='abierta') THEN
    INSERT INTO public.cash_registers(shop_id,initial_amount,status,opening_verified)
      VALUES(v_shop,0,'abierta',true);
  END IF;
  SELECT count(*) INTO v_base_charges FROM public.manual_charges WHERE shop_id=v_shop;
  v_period:=public.pay_fixed_monthly_period(v_shop,v_fixed,v_month,'cash');
  SELECT manual_charge_id INTO STRICT v_charge FROM public.fixed_monthly_periods
    WHERE id=v_period AND shop_id=v_shop AND price_snapshot=v_price;

  v_rejected:=false;
  BEGIN
    PERFORM public.pay_fixed_monthly_period(v_shop,v_fixed,v_month,'cash');
  EXCEPTION WHEN unique_violation THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Pago duplicado no bloqueado'; END IF;

  v_sunday:=v_month+((4-extract(dow FROM v_month)::int+7)%7);
  FOR v_i IN 0..3 LOOP
    v_day:=v_sunday+7*v_i;
    IF v_day>v_today THEN RAISE EXCEPTION 'Fixture intenta completar fecha futura: %',v_day; END IF;
    PERFORM public.complete_fixed_monthly_occurrence(v_shop,v_fixed,v_day);
  END LOOP;
  SELECT count(*) INTO v_count FROM public.fixed_monthly_uses
    WHERE shop_id=v_shop AND fixed_booking_id=v_fixed AND period_id=v_period;
  IF v_count<>4 THEN RAISE EXCEPTION 'Se esperaban cuatro usos, se hallaron %',v_count; END IF;
  IF (SELECT count(*) FROM public.manual_charges WHERE shop_id=v_shop)<>v_base_charges+1 THEN
    RAISE EXCEPTION 'Los cuatro usos crearon cobros extra';
  END IF;

  v_rejected:=false;
  BEGIN
    PERFORM public.complete_fixed_monthly_occurrence(v_shop,v_fixed,v_sunday);
  EXCEPTION WHEN unique_violation THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Uso duplicado no bloqueado'; END IF;
  v_rejected:=false;
  BEGIN
    PERFORM public.complete_fixed_booking_occurrence(v_shop,v_fixed,v_sunday,'cash');
  EXCEPTION WHEN unique_violation THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Cobro del uso ya consumido no bloqueado'; END IF;

  UPDATE public.fixed_monthly_plans SET monthly_price=v_price+200
    WHERE shop_id=v_shop AND fixed_booking_id=v_october_fixed;
  IF (SELECT price_snapshot FROM public.fixed_monthly_periods WHERE id=v_period)<>v_price THEN
    RAISE EXCEPTION 'El cambio de precio alteró el snapshot histórico';
  END IF;

  -- Fijo temporal de laboratorio con inicio anterior a agosto; el slot 21:30
  -- es válido en el horario del dueño y termina antes del fijo QA de 22:00.
  INSERT INTO public.fixed_bookings(shop_id,barber_id,service_id,client_name,
      client_phone,client_email,weekday,time_slot,duration_minutes,start_date,active)
    VALUES(v_shop,v_owner,v_service,'QA_ABONOS_STRESS Quinto domingo','','',0,
      '21:30',30,date '2026-08-01',true) RETURNING id INTO v_fixed;
  INSERT INTO public.fixed_monthly_plans(shop_id,fixed_booking_id,monthly_price)
    VALUES(v_shop,v_fixed,v_price);
  SELECT count(*) INTO v_count FROM public.manual_charges WHERE shop_id=v_shop;
  v_period:=public.pay_fixed_monthly_period(v_shop,v_fixed,v_month,'transfer');
  IF NOT EXISTS(SELECT 1 FROM public.fixed_monthly_periods
      WHERE id=v_period AND payment_method='transfer' AND price_snapshot=v_price) OR
     (SELECT count(*) FROM public.manual_charges WHERE shop_id=v_shop)<>v_count+1 THEN
    RAISE EXCEPTION 'El pago por transferencia no generó exactamente un ingreso';
  END IF;
  UPDATE public.fixed_monthly_plans SET active=false
    WHERE shop_id=v_shop AND fixed_booking_id=v_fixed;
  IF NOT EXISTS(SELECT 1 FROM public.fixed_monthly_periods
      WHERE id=v_period AND payment_method='transfer') THEN
    RAISE EXCEPTION 'Desactivar el plan borró su historial';
  END IF;
  UPDATE public.fixed_monthly_plans SET active=true
    WHERE shop_id=v_shop AND fixed_booking_id=v_fixed;
  -- Agosto de 2026 tiene cinco domingos. Simulamos la mensualidad abonada y
  -- sus cuatro consumos previos para verificar el quinto mediante los RPC.
  INSERT INTO public.manual_charges(shop_id,barber_id,amount,note,date_string,payment_method)
    VALUES(v_shop,v_owner,v_price,'QA_ABONOS_STRESS · mensualidad simulada para quinto domingo',
      '2026-08-01','cash') RETURNING id INTO v_charge;
  INSERT INTO public.fixed_monthly_periods(shop_id,fixed_booking_id,period_month,
      price_snapshot,payment_method,manual_charge_id)
    VALUES(v_shop,v_fixed,v_past_month,v_price,'cash',v_charge) RETURNING id INTO v_period;
  FOREACH v_day IN ARRAY ARRAY[date '2026-08-02',date '2026-08-09',date '2026-08-16',date '2026-08-23'] LOOP
    INSERT INTO public.fixed_monthly_uses(shop_id,fixed_booking_id,period_id,occurrence_date)
      VALUES(v_shop,v_fixed,v_period,v_day);
  END LOOP;
  v_rejected:=false;
  BEGIN
    PERFORM public.complete_fixed_monthly_occurrence(v_shop,v_fixed,v_fifth_sunday);
  EXCEPTION WHEN check_violation THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'El quinto uso abonado no fue rechazado'; END IF;
  PERFORM public.complete_fixed_booking_occurrence(v_shop,v_fixed,v_fifth_sunday,'transfer');
  IF (SELECT count(*) FROM public.manual_charges WHERE shop_id=v_shop
      AND fixed_booking_id=v_fixed AND fixed_occurrence_date=v_fifth_sunday)<>1 THEN
    RAISE EXCEPTION 'El quinto corte individual no generó exactamente un cargo';
  END IF;

  RAISE NOTICE 'QA_ABONOS_STRESS OK: 1 mensualidad, 4 usos sin cobro extra, duplicados bloqueados, quinto corte individual';
END;
$qa$;
ROLLBACK;
