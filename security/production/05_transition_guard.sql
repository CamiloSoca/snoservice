-- PREPARADO PARA PRODUCCIÓN, NO EJECUTADO. Requiere revisión y ensayo en clon.
-- No actualiza ni borra turnos. El trigger decide con el reloj de PostgreSQL.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.guard_appointment_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $body$
DECLARE
  v_created_day date;
  v_scheduled_day date;
  v_scheduled_at timestamptz;
  v_month integer;
  v_day integer;
  v_months text[] := ARRAY['Ene','Feb','Mar','Abr','May','Jun',
                            'Jul','Ago','Sep','Oct','Nov','Dic'];
  v_weekdays text[] := ARRAY['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
BEGIN
  IF NEW.shop_id IS DISTINCT FROM OLD.shop_id OR
     NEW.barber_id IS DISTINCT FROM OLD.barber_id OR
     NEW.service_id IS DISTINCT FROM OLD.service_id OR
     NEW.date_string IS DISTINCT FROM OLD.date_string OR
     NEW.time_slot IS DISTINCT FROM OLD.time_slot OR
     NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes OR
     NEW.price_snapshot IS DISTINCT FROM OLD.price_snapshot THEN
    RAISE EXCEPTION 'Los datos económicos y el horario del turno son inmutables'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF OLD.status IS DISTINCT FROM 'confirmado' OR
     NEW.status IS NULL OR NEW.status NOT IN ('cancelado','completado') THEN
    RAISE EXCEPTION 'Sólo un turno confirmado puede cancelarse o completarse una vez'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.date_string !~ '^[^ ]+ [0-9]{1,2} [^ ]+$' OR
     OLD.time_slot !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RAISE EXCEPTION 'Fecha u hora del turno no verificable' USING ERRCODE = '23514';
  END IF;
  v_month := array_position(v_months, split_part(OLD.date_string, ' ', 3));
  v_day := split_part(OLD.date_string, ' ', 2)::integer;
  IF v_month IS NULL OR v_day NOT BETWEEN 1 AND 31 THEN
    RAISE EXCEPTION 'Fecha del turno no verificable' USING ERRCODE = '23514';
  END IF;

  v_created_day := (OLD.created_at AT TIME ZONE 'America/Montevideo')::date;
  v_scheduled_day := make_date(EXTRACT(YEAR FROM v_created_day)::integer, v_month, v_day);
  IF v_scheduled_day < v_created_day THEN
    v_scheduled_day := make_date(EXTRACT(YEAR FROM v_created_day)::integer + 1, v_month, v_day);
  END IF;
  IF v_scheduled_day - v_created_day NOT BETWEEN 0 AND 30 OR
     split_part(OLD.date_string, ' ', 1) IS DISTINCT FROM
       v_weekdays[EXTRACT(DOW FROM v_scheduled_day)::integer + 1] THEN
    RAISE EXCEPTION 'Fecha histórica ambigua; revisar manualmente el turno'
      USING ERRCODE = '23514';
  END IF;

  v_scheduled_at := (v_scheduled_day + OLD.time_slot::time)
    AT TIME ZONE 'America/Montevideo';
  IF NEW.status = 'cancelado' AND v_scheduled_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'El turno ya comenzó o pasó; no se puede cancelar'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'completado' AND v_scheduled_at > clock_timestamp() THEN
    RAISE EXCEPTION 'No se puede completar un turno futuro'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$body$;

CREATE OR REPLACE TRIGGER trg_guard_appointment_transition
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.guard_appointment_transition();

REVOKE ALL ON FUNCTION public.guard_appointment_transition() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_appointment_transition() TO service_role;
COMMIT;
