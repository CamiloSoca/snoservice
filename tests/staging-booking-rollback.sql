-- Staging vjtwvhdiypfxgodhnjiw. Ejecutar completo en UNA sesión.
-- Crea exclusivamente un local nuevo; el ROLLBACK elimina todos los fixtures.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='25s';
CREATE TEMP TABLE booking_results(scenario text, passed boolean) ON COMMIT DROP;
DO $audit$
DECLARE
  s uuid;
  b uuid;
  incompatible uuid;
  service_id uuid;
  d date := (clock_timestamp() AT TIME ZONE 'America/Montevideo')::date+1;
  closed_day date := (clock_timestamp() AT TIME ZONE 'America/Montevideo')::date+2;
  label text;
  closed_label text;
  today_label text;
  weekdays text[] := ARRAY['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  months text[] := ARRAY['Ene','Feb','Mar','Abr','May','Jun',
                          'Jul','Ago','Sep','Oct','Nov','Dic'];
  keys text[] := ARRAY['domingo','lunes','martes','miercoles',
                        'jueves','viernes','sabado'];
  schedule jsonb := '{}'::jsonb;
  day_key text;
  state text;
BEGIN
  FOREACH day_key IN ARRAY keys LOOP
    schedule := jsonb_set(schedule,ARRAY[day_key],
      '{"isOpen":true,"openTime":"09:00","closeTime":"19:00"}'::jsonb);
  END LOOP;
  schedule := jsonb_set(schedule,ARRAY[keys[extract(dow from closed_day)::int+1]],
    '{"isOpen":false,"openTime":"09:00","closeTime":"19:00"}'::jsonb);
  label := weekdays[extract(dow from d)::int+1] || ' ' ||
    extract(day from d)::int || ' ' || months[extract(month from d)::int];
  closed_label := weekdays[extract(dow from closed_day)::int+1] || ' ' ||
    extract(day from closed_day)::int || ' ' || months[extract(month from closed_day)::int];
  today_label := weekdays[extract(dow from d-1)::int+1] || ' ' ||
    extract(day from d-1)::int || ' ' || months[extract(month from d-1)::int];
  INSERT INTO public.shops(slug,name,schedule)
    VALUES ('audit-booking-'||replace(gen_random_uuid()::text,'-',''),'Audit booking',schedule)
    RETURNING id INTO s;
  INSERT INTO public.services(shop_id,name,price,duration_minutes,active)
    VALUES(s,'Test',600,45,true) RETURNING id INTO service_id;
  INSERT INTO public.barbers(shop_id,name,commission_rate,pin,active,service_ids)
    VALUES(s,'Test',50,'9876',true,ARRAY[service_id]) RETURNING id INTO b;
  INSERT INTO public.barbers(shop_id,name,commission_rate,pin,active,service_ids)
    VALUES(s,'Incompatible',50,'9876',true,ARRAY[gen_random_uuid()]) RETURNING id INTO incompatible;

  INSERT INTO public.appointments(shop_id,code,service_id,barber_id,client_name,
      client_phone,client_email,date_string,time_slot,duration_minutes,price_snapshot)
    VALUES(s,'AUDIT-VALID',service_id,b,'Prueba Válida',
      '098521340','audit1@example.invalid',label,'10:00',45,600);
  INSERT INTO booking_results VALUES ('reserva válida',true);

  BEGIN
    INSERT INTO public.appointments(shop_id,code,service_id,barber_id,client_name,
        client_phone,client_email,date_string,time_slot,duration_minutes,price_snapshot)
      VALUES(s,'AUDIT-OVERLAP',service_id,b,'Prueba Dos',
        '098521341','audit2@example.invalid',label,'10:30',45,600);
    INSERT INTO booking_results VALUES ('solapamiento',false);
  EXCEPTION WHEN exclusion_violation THEN
    INSERT INTO booking_results VALUES ('solapamiento',true);
  END;
  BEGIN
    INSERT INTO public.appointments(shop_id,code,service_id,barber_id,client_name,
        client_phone,client_email,date_string,time_slot,duration_minutes,price_snapshot)
      VALUES(s,'AUDIT-DUPLICATE',service_id,b,'Prueba Tres',
        '098521342','audit3@example.invalid',label,'10:00',45,600);
    INSERT INTO booking_results VALUES ('franja duplicada',false);
  EXCEPTION WHEN exclusion_violation OR unique_violation THEN
    INSERT INTO booking_results VALUES ('franja duplicada',true);
  END;

  BEGIN
    INSERT INTO public.appointments(shop_id,code,service_id,barber_id,client_name,
        client_phone,client_email,date_string,time_slot,duration_minutes,price_snapshot)
      VALUES(s,'AUDIT-CLOSED',service_id,b,'Prueba Cerrado',
        '098521343','audit4@example.invalid',closed_label,'10:00',45,600);
    INSERT INTO booking_results VALUES ('día cerrado',false);
  EXCEPTION WHEN check_violation THEN
    INSERT INTO booking_results VALUES ('día cerrado',true);
  END;
  BEGIN
    INSERT INTO public.appointments(shop_id,code,service_id,barber_id,client_name,
        client_phone,client_email,date_string,time_slot,duration_minutes,price_snapshot)
      VALUES(s,'AUDIT-OUTSIDE',service_id,b,'Prueba Horario',
        '098521344','audit5@example.invalid',label,'08:30',45,600);
    INSERT INTO booking_results VALUES ('fuera de horario',false);
  EXCEPTION WHEN check_violation THEN
    INSERT INTO booking_results VALUES ('fuera de horario',true);
  END;
  BEGIN
    INSERT INTO public.appointments(shop_id,code,service_id,barber_id,client_name,
        client_phone,client_email,date_string,time_slot,duration_minutes,price_snapshot)
      VALUES(s,'AUDIT-PAST',service_id,b,'Prueba Pasado',
        '098521345','audit6@example.invalid',today_label,'00:00',45,600);
    INSERT INTO booking_results VALUES ('horario pasado',false);
  EXCEPTION WHEN check_violation THEN
    INSERT INTO booking_results VALUES ('horario pasado',true);
  END;
  BEGIN
    INSERT INTO public.appointments(shop_id,code,service_id,barber_id,client_name,
        client_phone,client_email,date_string,time_slot,duration_minutes,price_snapshot)
      VALUES(s,'AUDIT-BARBER',service_id,incompatible,'Prueba Barbero',
        '098521346','audit7@example.invalid',label,'12:00',45,600);
    INSERT INTO booking_results VALUES ('barbero incompatible',false);
  EXCEPTION WHEN check_violation THEN
    INSERT INTO booking_results VALUES ('barbero incompatible',true);
  END;
  BEGIN
    INSERT INTO public.appointments(shop_id,code,service_id,barber_id,client_name,
        client_phone,client_email,date_string,time_slot,duration_minutes,price_snapshot)
      VALUES(s,'AUDIT-PRICE',service_id,b,'Prueba Precio',
        '098521347','audit8@example.invalid',label,'12:00',45,1);
    INSERT INTO booking_results VALUES ('precio manipulado',false);
  EXCEPTION WHEN check_violation THEN
    INSERT INTO booking_results VALUES ('precio manipulado',true);
  END;
  BEGIN
    INSERT INTO public.appointments(shop_id,code,service_id,barber_id,client_name,
        client_phone,client_email,date_string,time_slot,duration_minutes,price_snapshot)
      VALUES(s,'AUDIT-DURATION',service_id,b,'Prueba Duración',
        '098521348','audit9@example.invalid',label,'12:00',5,600);
    INSERT INTO booking_results VALUES ('duración manipulada',false);
  EXCEPTION WHEN check_violation THEN
    INSERT INTO booking_results VALUES ('duración manipulada',true);
  END;
  BEGIN
    INSERT INTO public.appointments(shop_id,code,service_id,barber_id,client_name,
        client_phone,client_email,date_string,time_slot,duration_minutes,price_snapshot,status)
      VALUES(s,'AUDIT-STATUS',service_id,b,'Prueba Estado',
        '098521349','audit10@example.invalid',label,'12:00',45,600,'completado');
    INSERT INTO booking_results VALUES ('alta completada directa',false);
  EXCEPTION WHEN check_violation THEN
    INSERT INTO booking_results VALUES ('alta completada directa',true);
  END;
  BEGIN
    INSERT INTO public.appointments(shop_id,code,service_id,barber_id,client_name,
        client_phone,client_email,date_string,time_slot,duration_minutes,price_snapshot)
      VALUES(s,'AUDIT-EMAIL',service_id,b,'Prueba Correo',
        '098521350',NULL,label,'12:00',45,600);
    INSERT INTO booking_results VALUES ('formulario incompleto',false);
  EXCEPTION WHEN check_violation THEN
    INSERT INTO booking_results VALUES ('formulario incompleto',true);
  END;
  BEGIN
    INSERT INTO public.appointments(shop_id,code,service_id,barber_id,client_name,
        client_phone,client_email,date_string,time_slot,duration_minutes,price_snapshot)
      VALUES(s,'AUDIT-PHONE',service_id,b,'Prueba Celular',
        '123','audit11@example.invalid',label,'12:00',45,600);
    INSERT INTO booking_results VALUES ('celular inválido',false);
  EXCEPTION WHEN check_violation THEN
    INSERT INTO booking_results VALUES ('celular inválido',true);
  END;
  BEGIN
    INSERT INTO public.appointments(shop_id,code,service_id,barber_id,client_name,
        client_phone,client_email,date_string,time_slot,duration_minutes,price_snapshot)
      VALUES(s,'AUDIT-SAME-PHONE',service_id,b,'Prueba Repetida',
        '098521340','audit12@example.invalid',label,'13:00',45,600);
    INSERT INTO booking_results VALUES ('celular repetido',false);
  EXCEPTION WHEN check_violation THEN
    INSERT INTO booking_results VALUES ('celular repetido',true);
  END;
END;
$audit$;
SELECT scenario,passed FROM booking_results ORDER BY scenario;
ROLLBACK;
