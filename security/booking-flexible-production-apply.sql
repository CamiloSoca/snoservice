-- PRODUCCION 13-CUT: permite ocupar huecos ANTES de un turno ya reservado.
-- REQUIERE codigo web compatible. No modifica ni elimina turnos existentes.
-- No toca RLS, ni concede permisos publicos.
-- Ejecucion transaccional; ante error se revierte todo.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '90s';

LOCK TABLE public.appointments IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.shops) <> 1 OR
     NOT EXISTS (SELECT 1 FROM public.shops
       WHERE id = '11111111-1111-1111-1111-111111111113'::uuid) THEN
    RAISE EXCEPTION 'ABORTADO: no es la base de produccion esperada de 13-Cut';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.appointments'::regclass
      AND conname = 'appointments_no_active_overlap'
      AND contype = 'x'
  ) THEN
    RAISE EXCEPTION 'ABORTADO: no se encontro la restriccion previa esperada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.appointments'::regclass
      AND t.tgname = 'trg_validate_appointment_booking'
      AND p.proname = 'validate_appointment_booking'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'ABORTADO: el trigger heredado no es el esperado';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.appointments
    WHERE status IS DISTINCT FROM 'cancelado'
      AND (shop_id IS NULL OR barber_id IS NULL OR date_string IS NULL
        OR time_slot !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        OR COALESCE(duration_minutes,0) <= 0)
  ) THEN
    RAISE EXCEPTION 'ABORTADO: hay reservas con horario o duracion invalida';
  END IF;
END $$;

-- Protección incondicional frente a dos reservas del mismo horario.
-- Instalar ANTES de eliminar la exclusion estricta.
CREATE UNIQUE INDEX appointments_one_active_start
ON public.appointments (shop_id, barber_id, date_string, time_slot)
WHERE status IS DISTINCT FROM 'cancelado';

-- La operacion posterior SI respeta la diferencia entre reserva anterior
-- (se respeta su duracion completa) y hueco previo a una reserva existente.
CREATE FUNCTION public.validate_booking_flexible()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  new_start integer;
  new_end integer;
  old_start integer;
  old_end integer;
  booked record;
BEGIN
  IF NEW.status = 'cancelado' THEN
    RETURN NEW;
  END IF;

  -- Cambiar datos de cliente o completar un turno no altera su horario.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM 'cancelado'
      AND NEW.status IS DISTINCT FROM 'cancelado'
      AND ROW(NEW.shop_id,NEW.barber_id,NEW.date_string,NEW.time_slot,NEW.duration_minutes)
        IS NOT DISTINCT FROM
        ROW(OLD.shop_id,OLD.barber_id,OLD.date_string,OLD.time_slot,OLD.duration_minutes)
    THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.shop_id IS NULL OR NEW.barber_id IS NULL OR NEW.date_string IS NULL
     OR NEW.time_slot IS NULL
     OR NEW.time_slot !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     OR NEW.duration_minutes IS NULL
     OR NEW.duration_minutes < 15 OR NEW.duration_minutes > 1440 THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='Fecha, horario o duracion de turno invalida';
  END IF;

  new_start := substring(NEW.time_slot,1,2)::integer * 60 +
               substring(NEW.time_slot,4,2)::integer;
  new_end := new_start + NEW.duration_minutes;

  -- Serializar por negocio/barbero/dia, evitando carreras entre peticiones.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    NEW.shop_id::text || ':' || NEW.barber_id::text || ':' || NEW.date_string, 0
  ));

  FOR booked IN
    SELECT id, time_slot, COALESCE(duration_minutes,60) AS duration_minutes
    FROM public.appointments
    WHERE shop_id = NEW.shop_id
      AND barber_id = NEW.barber_id
      AND date_string = NEW.date_string
      AND status IS DISTINCT FROM 'cancelado'
      AND id IS DISTINCT FROM NEW.id
  LOOP
    old_start := substring(booked.time_slot,1,2)::integer * 60 +
                 substring(booked.time_slot,4,2)::integer;
    old_end := old_start + booked.duration_minutes;

    -- Mismo inicio: siempre prohibido.
    IF new_start = old_start THEN
      RAISE EXCEPTION USING ERRCODE='23505',
        MESSAGE='Ya existe un turno a esa hora';
    END IF;

    -- Turno existente ANTERIOR: respetar su duracion hacia adelante.
    IF old_start < new_start AND old_end > new_start THEN
      RAISE EXCEPTION USING ERRCODE='23P01',
        MESSAGE='El barbero ya tiene un turno anterior en ese intervalo';
    END IF;

    -- Turno existente POSTERIOR: permitir el hueco anterior desde 30 min
    -- SOLO cuando AMBOS servicios duran como maximo 90 minutos.
    IF old_start > new_start AND new_end > old_start THEN
      IF NEW.duration_minutes > 90
        OR booked.duration_minutes > 90
        OR old_start - new_start < 30
      THEN
        RAISE EXCEPTION USING ERRCODE='23P01',
          MESSAGE='Este servicio no entra en el hueco disponible';
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_booking_flexible() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_booking_flexible() TO service_role;

-- Sustituir el viejo validador que trataba todo solapamiento igual.
DROP TRIGGER trg_validate_appointment_booking ON public.appointments;
CREATE TRIGGER trg_validate_appointment_booking
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.validate_booking_flexible();

-- El constraint anterior es simetrico: no permite huecos hacia atras.
-- El index unico + trigger con candado transaccional lo sustituyen.
ALTER TABLE public.appointments
  DROP CONSTRAINT appointments_no_active_overlap;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public'
      AND tablename='appointments' AND indexname='appointments_one_active_start'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid='public.appointments'::regclass
      AND tgname='trg_validate_appointment_booking' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'ABORTADO: no quedo instalada la proteccion de doble reserva';
  END IF;
END $$;

COMMIT;
SELECT 'OK: validacion flexible activada, RLS intacta' AS resultado;
