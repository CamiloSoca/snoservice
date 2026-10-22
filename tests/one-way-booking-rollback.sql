-- Pruebas reversibles de agenda en una tienda aislada.
-- Correr TODO junto luego de migration 13. No escribe datos permanentes.
BEGIN;
SET LOCAL statement_timeout='40s';
CREATE TEMP TABLE one_way_results(scenario text,passed boolean) ON COMMIT DROP;
DO $audit$
DECLARE
 sh uuid; b1 uuid; b2 uuid; cut_service uuid; long_service uuid;
 tomorrow date:=(clock_timestamp() AT TIME ZONE 'America/Montevideo')::date+1;
 label text;
 weekdays text[]:=ARRAY['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
 months text[]:=ARRAY['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
 schedule_json jsonb;
BEGIN
 label:=weekdays[extract(dow from tomorrow)::int+1]||' '||
        extract(day from tomorrow)::int||' '||months[extract(month from tomorrow)::int];
 SELECT jsonb_object_agg(key,'{"isOpen":true,"openTime":"09:00","closeTime":"19:00"}'::jsonb)
   INTO schedule_json
 FROM unnest(ARRAY['lunes','martes','miercoles','jueves','viernes','sabado','domingo']) AS key;
 INSERT INTO public.shops(slug,name,schedule)
 VALUES('test-one-way-'||replace(gen_random_uuid()::text,'-',''),'One Way Test',schedule_json)
 RETURNING id INTO sh;
 INSERT INTO public.services(shop_id,name,price,duration_minutes,active)
 VALUES(sh,'Corte 60',400,60,true) RETURNING id INTO cut_service;
 INSERT INTO public.services(shop_id,name,price,duration_minutes,active)
 VALUES(sh,'Mechas 120',1400,120,true) RETURNING id INTO long_service;
 INSERT INTO public.barbers(shop_id,name,commission_rate,pin,is_owner)
 VALUES(sh,'Barber A',50,'9876',false) RETURNING id INTO b1;
 INSERT INTO public.barbers(shop_id,name,commission_rate,pin,is_owner)
 VALUES(sh,'Barber B',50,'9876',false) RETURNING id INTO b2;

 -- Primer turno, 09:30-10:30.
 INSERT INTO public.appointments(shop_id,code,service_id,barber_id,date_string,time_slot,duration_minutes,price_snapshot,client_name,client_phone,client_email,created_at)
 VALUES(sh,'ONE-WAY-1',cut_service,b1,label,'09:30',60,400,'Cliente Uno','098521340','c1@example.invalid',now()-interval '20 minutes');
 INSERT INTO one_way_results VALUES ('reserva existente 09:30',true);
 -- 09:00-10:00 se puede apurar y terminar al empezar 09:30 (+30 margen).
 INSERT INTO public.appointments(shop_id,code,service_id,barber_id,date_string,time_slot,duration_minutes,price_snapshot,client_name,client_phone,client_email,created_at)
 VALUES(sh,'ONE-WAY-2',cut_service,b1,label,'09:00',60,400,'Cliente Dos','098521341','c2@example.invalid',now()-interval '20 minutes');
 INSERT INTO one_way_results VALUES ('09:00 permitida antes de 09:30',true);

 BEGIN
  INSERT INTO public.appointments(shop_id,code,service_id,barber_id,date_string,time_slot,duration_minutes,price_snapshot,client_name,client_phone,client_email,created_at)
  VALUES(sh,'ONE-WAY-3',cut_service,b1,label,'10:00',60,400,'Cliente Tres','098521342','c3@example.invalid',now()-interval '20 minutes');
  INSERT INTO one_way_results VALUES ('10:00 bloqueada después de 09:30',false);
 EXCEPTION WHEN exclusion_violation THEN
  INSERT INTO one_way_results VALUES ('10:00 bloqueada después de 09:30',true);
 END;

 INSERT INTO public.appointments(shop_id,code,service_id,barber_id,date_string,time_slot,duration_minutes,price_snapshot,client_name,client_phone,client_email,created_at)
 VALUES(sh,'ONE-WAY-4',cut_service,b1,label,'10:30',60,400,'Cliente Cuatro','098521343','c4@example.invalid',now()-interval '20 minutes');
 INSERT INTO one_way_results VALUES ('10:30 permitida después de 10:30',true);

 BEGIN
  INSERT INTO public.appointments(shop_id,code,service_id,barber_id,date_string,time_slot,duration_minutes,price_snapshot,client_name,client_phone,client_email,created_at)
  VALUES(sh,'ONE-WAY-5',long_service,b1,label,'09:00',120,1400,'Cliente Cinco','098521344','c5@example.invalid',now()-interval '20 minutes');
  INSERT INTO one_way_results VALUES ('mechas 09:00 bloqueadas',false);
 EXCEPTION WHEN exclusion_violation THEN
  INSERT INTO one_way_results VALUES ('mechas 09:00 bloqueadas',true);
 END;

 -- En orden inverso NO abrir 09:30 si 09:00 ya estaba reservada.
 INSERT INTO public.appointments(shop_id,code,service_id,barber_id,date_string,time_slot,duration_minutes,price_snapshot,client_name,client_phone,client_email,created_at)
 VALUES(sh,'ONE-WAY-6',cut_service,b2,label,'09:00',60,400,'Cliente Seis','098521345','c6@example.invalid',now()-interval '20 minutes');
 BEGIN
  INSERT INTO public.appointments(shop_id,code,service_id,barber_id,date_string,time_slot,duration_minutes,price_snapshot,client_name,client_phone,client_email,created_at)
  VALUES(sh,'ONE-WAY-7',cut_service,b2,label,'09:30',60,400,'Cliente Siete','098521346','c7@example.invalid',now()-interval '20 minutes');
  INSERT INTO one_way_results VALUES ('09:30 bloqueada si 09:00 fue primera',false);
 EXCEPTION WHEN exclusion_violation THEN
  INSERT INTO one_way_results VALUES ('09:30 bloqueada si 09:00 fue primera',true);
 END;

 -- Cierre 19:00: corte 18:30 a 19:30 aceptado.
 INSERT INTO public.appointments(shop_id,code,service_id,barber_id,date_string,time_slot,duration_minutes,price_snapshot,client_name,client_phone,client_email,created_at)
 VALUES(sh,'ONE-WAY-8',cut_service,b1,label,'18:30',60,400,'Cliente Ocho','098521347','c8@example.invalid',now()-interval '20 minutes');
 INSERT INTO one_way_results VALUES ('corte 18:30 con cierre 19 permitido',true);
 BEGIN
  INSERT INTO public.appointments(shop_id,code,service_id,barber_id,date_string,time_slot,duration_minutes,price_snapshot,client_name,client_phone,client_email,created_at)
  VALUES(sh,'ONE-WAY-9',long_service,b2,label,'18:30',120,1400,'Cliente Nueve','098521348','c9@example.invalid',now()-interval '20 minutes');
  INSERT INTO one_way_results VALUES ('mechas 18:30 con cierre 19 bloqueadas',false);
 EXCEPTION WHEN check_violation THEN
  INSERT INTO one_way_results VALUES ('mechas 18:30 con cierre 19 bloqueadas',true);
 END;
 BEGIN
  INSERT INTO public.appointments(shop_id,code,service_id,barber_id,date_string,time_slot,duration_minutes,price_snapshot,client_name,client_phone,client_email,created_at)
  VALUES(sh,'ONE-WAY-10',cut_service,b2,label,'19:00',60,400,'Cliente Diez','098521349','c10@example.invalid',now()-interval '20 minutes');
  INSERT INTO one_way_results VALUES ('no iniciar al cierre 19',false);
 EXCEPTION WHEN check_violation THEN
  INSERT INTO one_way_results VALUES ('no iniciar al cierre 19',true);
 END;
END $audit$;
SELECT jsonb_build_object(
 'total',count(*),'passed',count(*) FILTER (WHERE passed),
 'failures',COALESCE(jsonb_agg(scenario) FILTER (WHERE NOT passed),'[]'::jsonb)
) AS results FROM one_way_results;
ROLLBACK;
