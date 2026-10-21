-- Exclusivamente para Supabase staging vjtwvhdiypfxgodhnjiw.
-- El conector debe ejecutar todo este archivo en una única sesión.
-- Sólo se crean filas de un local nuevo de prueba y se hace ROLLBACK.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '25s';
CREATE TEMP TABLE audit_results (scenario text, passed boolean) ON COMMIT DROP;

DO $audit$
DECLARE
  v_shop uuid;
  v_employee uuid;
  v_owner uuid;
  v_service uuid;
  v_future_id uuid;
  v_past_id uuid;
  v_employee_appointment uuid;
  v_owner_appointment uuid;
  v_charge uuid := gen_random_uuid();
  v_future_day date := (now() AT TIME ZONE 'America/Montevideo')::date + 1;
  v_past_day date := (now() AT TIME ZONE 'America/Montevideo')::date - 1;
  v_future_label text;
  v_past_label text;
  v_days text[] := ARRAY['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  v_months text[] := ARRAY['Ene','Feb','Mar','Abr','May','Jun',
                           'Jul','Ago','Sep','Oct','Nov','Dic'];
  v_state text;
  v_summary jsonb;
  v_owner_share numeric;
  v_employee_share numeric;
BEGIN
  v_future_label := v_days[extract(dow from v_future_day)::int+1] || ' ' ||
    extract(day from v_future_day)::int || ' ' || v_months[extract(month from v_future_day)::int];
  v_past_label := v_days[extract(dow from v_past_day)::int+1] || ' ' ||
    extract(day from v_past_day)::int || ' ' || v_months[extract(month from v_past_day)::int];

  INSERT INTO public.shops(slug,name)
    VALUES ('audit-rollback-' || replace(gen_random_uuid()::text,'-',''), 'Audit ROLLBACK')
    RETURNING id INTO v_shop;
  INSERT INTO public.services(shop_id,name,price,duration_minutes)
    VALUES (v_shop,'Test',600,45) RETURNING id INTO v_service;
  INSERT INTO public.barbers(shop_id,name,commission_rate,pin,is_owner)
    VALUES (v_shop,'Empleado de prueba',50,'9876',false) RETURNING id INTO v_employee;
  INSERT INTO public.barbers(shop_id,name,commission_rate,pin,is_owner)
    VALUES (v_shop,'Dueño de prueba',50,'9876',true) RETURNING id INTO v_owner;
  INSERT INTO public.cash_registers(shop_id,status,initial_amount)
    VALUES (v_shop,'abierta',0);

  BEGIN
    INSERT INTO public.cash_registers(shop_id,status,initial_amount)
      VALUES (v_shop,'abierta',0);
    INSERT INTO audit_results VALUES ('dos cajas abiertas',false);
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO audit_results VALUES ('dos cajas abiertas',true);
  END;

  INSERT INTO public.appointments(shop_id,code,service_id,barber_id,client_name,
      client_phone,date_string,time_slot,duration_minutes,price_snapshot,created_at)
    VALUES (v_shop,'AUDIT-FUTURE-1',v_service,v_employee,'Prueba Uno',
      '098521345',v_future_label,'10:00',45,600,now()-interval '1 day')
    RETURNING id INTO v_future_id;
  BEGIN
    INSERT INTO public.appointments(shop_id,code,service_id,barber_id,client_name,
        client_phone,date_string,time_slot,duration_minutes,price_snapshot,created_at)
      VALUES (v_shop,'AUDIT-OVERLAP',v_service,v_employee,'Prueba Dos',
        '098521346',v_future_label,'10:30',30,600,now()-interval '1 day');
    INSERT INTO audit_results VALUES ('solapamiento de distinta duración',false);
  EXCEPTION WHEN exclusion_violation THEN
    INSERT INTO audit_results VALUES ('solapamiento de distinta duración',true);
  END;

  INSERT INTO public.appointments(shop_id,code,service_id,barber_id,client_name,
      client_phone,date_string,time_slot,duration_minutes,price_snapshot,created_at)
    VALUES (v_shop,'AUDIT-PAST-1',v_service,v_employee,'Prueba Tres',
      '098521347',v_past_label,'10:00',45,600,now()-interval '2 days')
    RETURNING id INTO v_past_id;
  BEGIN
    UPDATE public.appointments SET status='cancelado' WHERE id=v_past_id;
    INSERT INTO audit_results VALUES ('cancelación vencida rechazada',false);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    INSERT INTO audit_results VALUES ('cancelación vencida rechazada',v_state='23514');
  END;

  BEGIN
    UPDATE public.appointments SET status='completado' WHERE id=v_future_id;
    INSERT INTO audit_results VALUES ('completar futuro rechazado',false);
    UPDATE public.appointments SET status='confirmado' WHERE id=v_future_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    INSERT INTO audit_results VALUES ('completar futuro rechazado',v_state='23514');
  END;
  UPDATE public.appointments SET status='cancelado' WHERE id=v_future_id;
  INSERT INTO audit_results VALUES ('cancelación futura válida',
    (SELECT status='cancelado' FROM public.appointments WHERE id=v_future_id));

  INSERT INTO public.appointments(shop_id,code,service_id,barber_id,client_name,
      client_phone,date_string,time_slot,duration_minutes,price_snapshot,created_at)
    VALUES (v_shop,'AUDIT-EMPLOYEE',v_service,v_employee,'Prueba Cuatro',
      '098521348',v_past_label,'11:00',45,600,now()-interval '2 days')
    RETURNING id INTO v_employee_appointment;
  INSERT INTO public.appointments(shop_id,code,service_id,barber_id,client_name,
      client_phone,date_string,time_slot,duration_minutes,price_snapshot,created_at)
    VALUES (v_shop,'AUDIT-OWNER',v_service,v_owner,'Prueba Cinco',
      '098521349',v_past_label,'11:00',45,101.01,now()-interval '2 days')
    RETURNING id INTO v_owner_appointment;
  UPDATE public.appointments SET status='completado'
    WHERE id IN (v_employee_appointment,v_owner_appointment);
  SELECT barber_earnings_snapshot INTO v_employee_share
    FROM public.appointments WHERE id=v_employee_appointment;
  SELECT business_earnings_snapshot INTO v_owner_share
    FROM public.appointments WHERE id=v_owner_appointment;
  INSERT INTO audit_results VALUES ('comisión empleado 50%',v_employee_share=300);
  INSERT INTO audit_results VALUES ('dueño 100% al negocio',v_owner_share=101.01);

  INSERT INTO public.manual_charges(id,shop_id,barber_id,amount,note,date_string)
    VALUES (v_charge,v_shop,v_employee,200,'Test','Hoy');
  BEGIN
    INSERT INTO public.manual_charges(id,shop_id,barber_id,amount,note,date_string)
      VALUES (v_charge,v_shop,v_employee,200,'Test','Hoy');
    INSERT INTO audit_results VALUES ('cobro repetido rechazado',false);
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO audit_results VALUES ('cobro repetido rechazado',true);
  END;
  UPDATE public.barbers SET commission_rate=33 WHERE id=v_employee;
  INSERT INTO audit_results VALUES ('snapshot anterior inmutable',
    (SELECT barber_earnings_snapshot=300 FROM public.appointments
      WHERE id=v_employee_appointment) AND
    (SELECT barber_earnings_snapshot=100 FROM public.manual_charges WHERE id=v_charge));
  INSERT INTO public.manual_charges(shop_id,barber_id,amount,note,date_string)
    VALUES (v_shop,v_employee,101.01,'Test decimal','Hoy');
  INSERT INTO audit_results VALUES ('comisión decimal 33%',
    (SELECT barber_earnings_snapshot=33.33 AND business_earnings_snapshot=67.68
     FROM public.manual_charges WHERE shop_id=v_shop AND note='Test decimal'));
  INSERT INTO public.tips(shop_id,barber_id,amount,note,date_string)
    VALUES (v_shop,v_employee,50,'Test','Hoy');
  INSERT INTO public.expenses(shop_id,amount,description,category)
    VALUES (v_shop,40,'Test','Otros');
  SELECT public.close_cash_financial(v_shop) INTO v_summary;
  INSERT INTO audit_results VALUES ('cierre: bruto-comisiones-gastos',
    (v_summary->>'grossSales')::numeric=1002.02 AND
    (v_summary->>'barberCommissions')::numeric=433.33 AND
    (v_summary->>'expenses')::numeric=40 AND
    (v_summary->>'fundNet')::numeric=528.69 AND
    (v_summary->>'tips')::numeric=50);

  BEGIN
    PERFORM public.close_cash_financial(v_shop);
    INSERT INTO audit_results VALUES ('segundo cierre rechazado',false);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    INSERT INTO audit_results VALUES ('segundo cierre rechazado',v_state='P0002');
  END;
  BEGIN
    INSERT INTO public.manual_charges(shop_id,barber_id,amount,note,date_string)
      VALUES (v_shop,v_employee,10,'Caja cerrada','Hoy');
    INSERT INTO audit_results VALUES ('cobro con caja cerrada rechazado',false);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    INSERT INTO audit_results VALUES ('cobro con caja cerrada rechazado',v_state='23514');
  END;
END;
$audit$;

SELECT scenario, passed FROM audit_results ORDER BY scenario;
ROLLBACK;
