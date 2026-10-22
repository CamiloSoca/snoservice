-- Señal liviana para sincronización rápida de agendas (sin exponer datos de clientes).
-- No modifica los turnos actuales ni la regla de solapamiento unidireccional.
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS agenda_revision bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.bump_shop_agenda_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'pg_catalog', 'public'
AS $$
DECLARE
  target_shop uuid;
BEGIN
  target_shop := CASE WHEN TG_OP = 'DELETE' THEN OLD.shop_id ELSE NEW.shop_id END;
  UPDATE public.shops
    SET agenda_revision = agenda_revision + 1
    WHERE id = target_shop;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_agenda_revision ON public.appointments;
CREATE TRIGGER trg_appointments_agenda_revision
AFTER INSERT OR DELETE OR UPDATE OF status, barber_id, date_string, time_slot, duration_minutes
ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.bump_shop_agenda_revision();

-- No otorgar acceso público a este contador: solo API autenticada con service_role.
