-- Sólo revertir mientras ningún turno fijo haya sido cobrado.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $guard$
BEGIN
 IF to_regclass('public.manual_charges') IS NULL OR
   EXISTS(SELECT 1 FROM public.manual_charges WHERE fixed_booking_id IS NOT NULL) THEN
    RAISE EXCEPTION 'No revertir: existen cobros fijos que deben conservarse';
 END IF;
END;
$guard$;
DROP FUNCTION public.complete_fixed_booking_occurrence(uuid,uuid,date,text);
DROP TRIGGER trg_guard_completed_fixed_charge ON public.manual_charges;
DROP FUNCTION public.guard_completed_fixed_charge();
DROP INDEX public.manual_charges_fixed_occurrence_unique;
ALTER TABLE public.manual_charges DROP CONSTRAINT manual_charges_fixed_occurrence_pair;
ALTER TABLE public.manual_charges DROP COLUMN fixed_occurrence_date,DROP COLUMN fixed_booking_id;
NOTIFY pgrst,'reload schema';
COMMIT;
