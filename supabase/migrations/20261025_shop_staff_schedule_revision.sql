-- Every change in real shop/staff availability bumps the agenda cursor.
-- Does not alter opening hours, existing reservations, staff data or prices.
CREATE OR REPLACE FUNCTION public.bump_shop_hours_agenda_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO pg_catalog,public AS $fn$
BEGIN
  IF NEW.schedule IS DISTINCT FROM OLD.schedule THEN
    NEW.agenda_revision:=COALESCE(OLD.agenda_revision,0)+1;
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_shop_hours_agenda_revision ON public.shops;
CREATE TRIGGER trg_shop_hours_agenda_revision
BEFORE UPDATE OF schedule ON public.shops
FOR EACH ROW EXECUTE FUNCTION public.bump_shop_hours_agenda_revision();

CREATE OR REPLACE FUNCTION public.bump_barber_hours_agenda_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO pg_catalog,public AS $fn$
BEGIN
  IF NEW.working_schedule IS DISTINCT FROM OLD.working_schedule THEN
    UPDATE public.shops SET agenda_revision=COALESCE(agenda_revision,0)+1
    WHERE id=NEW.shop_id;
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_barber_hours_agenda_revision ON public.barbers;
CREATE TRIGGER trg_barber_hours_agenda_revision
AFTER UPDATE OF working_schedule ON public.barbers
FOR EACH ROW EXECUTE FUNCTION public.bump_barber_hours_agenda_revision();
