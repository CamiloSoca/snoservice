-- SNOSERVICE: turnos flexibles de barbería, sin doble reserva a la misma hora.
-- Hasta 90 min: solapamiento máximo 30 min. Más de 90: sin solapamiento.
-- Trigger con advisory lock transaccional para serializar altas concurrentes
-- del MISMO barbero y fecha sin depender de un SELECT previo del cliente.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='55s';

CREATE OR REPLACE FUNCTION public.guard_barbershop_booking_flex()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public
AS $body$
DECLARE
  v_start integer;
  v_overlap boolean;
BEGIN
  IF NEW.status='cancelado' THEN
    RETURN NEW;
  END IF;
  IF NEW.shop_id IS NULL OR NEW.barber_id IS NULL
    OR NEW.date_string IS NULL OR NEW.time_slot !~ '^[0-2][0-9]:[0-5][0-9]$'
    OR NEW.duration_minutes IS NULL OR NEW.duration_minutes<=0 THEN
    RAISE EXCEPTION 'Datos de reserva inválidos' USING ERRCODE='23514';
  END IF;
  -- El lock se libera automáticamente al finalizar la transacción.
  -- Las solicitudes simultáneas para el mismo profesional/día se serializan.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    NEW.shop_id::text || ':' || NEW.barber_id::text || ':' || NEW.date_string, 0
  ));
  v_start := substring(NEW.time_slot,1,2)::integer*60+
             substring(NEW.time_slot,4,2)::integer;

  SELECT EXISTS(
    SELECT 1 FROM public.appointments a
    WHERE a.shop_id=NEW.shop_id AND a.barber_id=NEW.barber_id
      AND a.date_string=NEW.date_string
      AND a.status IS DISTINCT FROM 'cancelado'
      AND a.id IS DISTINCT FROM NEW.id
      AND (
        (substring(a.time_slot,1,2)::integer*60+
         substring(a.time_slot,4,2)::integer)=v_start
        OR (
          GREATEST(0,
            LEAST(
              v_start+NEW.duration_minutes,
              (substring(a.time_slot,1,2)::integer*60+
               substring(a.time_slot,4,2)::integer)+COALESCE(a.duration_minutes,60)
            )-
            GREATEST(
              v_start,
              (substring(a.time_slot,1,2)::integer*60+
               substring(a.time_slot,4,2)::integer)
            )
          ) > CASE
            WHEN NEW.duration_minutes>90 OR COALESCE(a.duration_minutes,60)>90
              THEN 0
            ELSE 30
          END
        )
      )
  ) INTO v_overlap;

  IF v_overlap THEN
    RAISE EXCEPTION 'Ese turno se superpone con un horario no disponible'
      USING ERRCODE='23P01';
  END IF;
  RETURN NEW;
END;
$body$;

REVOKE ALL ON FUNCTION public.guard_barbershop_booking_flex()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_barbershop_booking_flex()
  TO service_role;

DROP TRIGGER IF EXISTS trg_zz_guard_barbershop_booking_flex ON public.appointments;
CREATE TRIGGER trg_zz_guard_barbershop_booking_flex
BEFORE INSERT OR UPDATE OF shop_id,barber_id,date_string,time_slot,duration_minutes,status
ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.guard_barbershop_booking_flex();

-- El EXCLUDE anterior compara la duración estricta de todo servicio.
-- Se sustituye ATÓMICAMENTE por la comprobación con lock de arriba.
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_no_active_overlap;
COMMIT;
