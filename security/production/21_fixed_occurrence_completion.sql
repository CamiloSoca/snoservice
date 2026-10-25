-- Agenda fija: marcar una ocurrencia como completada usando la contabilidad
-- real de manual_charges; sin duplicar dinero y sin crear turnos normales.
-- Los registros previos no se actualizan ni eliminan.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$
BEGIN
 IF to_regclass('public.fixed_bookings') IS NULL
 OR to_regclass('public.manual_charges') IS NULL
 OR EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='manual_charges'
      AND column_name IN ('fixed_booking_id','fixed_occurrence_date'))
 OR to_regprocedure('public.complete_fixed_booking_occurrence(uuid,uuid,date,text)') IS NOT NULL
 OR to_regprocedure('public.booking_display_label(date)') IS NULL
 THEN RAISE EXCEPTION 'Estructura de agenda distinta: abortar sin modificar datos';
 END IF;
END;
$preflight$;

ALTER TABLE public.manual_charges
  ADD COLUMN fixed_booking_id uuid REFERENCES public.fixed_bookings(id) ON DELETE RESTRICT,
  ADD COLUMN fixed_occurrence_date date;

ALTER TABLE public.manual_charges ADD CONSTRAINT manual_charges_fixed_occurrence_pair
 CHECK ((fixed_booking_id IS NULL AND fixed_occurrence_date IS NULL)
    OR (fixed_booking_id IS NOT NULL AND fixed_occurrence_date IS NOT NULL));

-- La segunda petición, aunque venga de otro celular, no puede volver a cobrar.
CREATE UNIQUE INDEX manual_charges_fixed_occurrence_unique
  ON public.manual_charges(shop_id,fixed_booking_id,fixed_occurrence_date)
  WHERE fixed_booking_id IS NOT NULL;

-- Un corte fijo completado es un documento contable, no un cobro manual
-- descartable. La reversión futura necesitará una conciliación supervisada.
CREATE FUNCTION public.guard_completed_fixed_charge()
 RETURNS trigger LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $fixed_charge_guard$
BEGIN
 IF OLD.fixed_booking_id IS NOT NULL THEN
   RAISE EXCEPTION 'Un fijo cobrado no se borra ni modifica; realizá una conciliación'
    USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.fixed_booking_id IS NOT NULL THEN
   RAISE EXCEPTION 'No se vincula retrospectivamente un cobro normal a un fijo'
    USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$fixed_charge_guard$;
CREATE TRIGGER trg_guard_completed_fixed_charge
 BEFORE DELETE OR UPDATE ON public.manual_charges
 FOR EACH ROW EXECUTE FUNCTION public.guard_completed_fixed_charge();

CREATE FUNCTION public.complete_fixed_booking_occurrence(
 p_shop_id uuid,p_fixed_id uuid,p_occurrence date,p_payment_method text
) RETURNS uuid
 LANGUAGE plpgsql SECURITY INVOKER
 SET search_path TO 'pg_catalog','public'
AS $complete_fixed$
DECLARE
 v_fixed public.fixed_bookings%ROWTYPE;
 v_date_now timestamp := clock_timestamp() AT TIME ZONE 'America/Montevideo';
 v_price numeric;
 v_service text;
 v_charge uuid;
BEGIN
 IF p_shop_id IS NULL OR p_fixed_id IS NULL OR p_occurrence IS NULL
   OR p_payment_method NOT IN ('cash','transfer') OR p_payment_method IS NULL THEN
   RAISE EXCEPTION 'Datos de cobro inválidos' USING ERRCODE='23514';
 END IF;
 -- Serializar altas de un mismo viernes y bloquear actualizaciones de ese fijo.
 SELECT * INTO v_fixed FROM public.fixed_bookings
 WHERE id=p_fixed_id AND shop_id=p_shop_id FOR SHARE;
 IF NOT FOUND OR NOT v_fixed.active
   OR p_occurrence < v_fixed.start_date
   OR (v_fixed.end_date IS NOT NULL AND p_occurrence > v_fixed.end_date)
   OR extract(dow from p_occurrence)::int <> v_fixed.weekday
   OR p_occurrence = ANY(v_fixed.skipped_dates) THEN
   RAISE EXCEPTION 'El turno fijo no corresponde a la fecha elegida' USING ERRCODE='23514';
 END IF;
 IF p_occurrence > v_date_now::date
    OR (p_occurrence = v_date_now::date AND
        v_fixed.time_slot::time > v_date_now::time) THEN
   RAISE EXCEPTION 'Todavía no comenzó este turno' USING ERRCODE='23514';
 END IF;
 IF EXISTS (SELECT 1 FROM public.manual_charges c
     WHERE c.shop_id=p_shop_id AND c.fixed_booking_id=p_fixed_id
       AND c.fixed_occurrence_date=p_occurrence) THEN
   RAISE EXCEPTION 'Esta fecha ya fue completada y cobrada' USING ERRCODE='23505';
 END IF;
 SELECT s.price,s.name INTO v_price,v_service
 FROM public.services s WHERE s.id=v_fixed.service_id AND s.shop_id=p_shop_id;
 IF NOT FOUND OR v_price IS NULL OR v_price <= 0 THEN
   RAISE EXCEPTION 'No se encontró un precio válido para este servicio' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.barbers b
    WHERE b.id=v_fixed.barber_id AND b.shop_id=p_shop_id AND b.active) THEN
   RAISE EXCEPTION 'Barbero no disponible' USING ERRCODE='23514';
 END IF;
 -- La función snapshot_manual_charge_finances, ya existente, aplica comisión
 -- del barbero / propietario y caja abierta en la misma transacción.
 INSERT INTO public.manual_charges(
   shop_id,barber_id,amount,note,date_string,payment_method,
   fixed_booking_id,fixed_occurrence_date
 ) VALUES (
   p_shop_id,v_fixed.barber_id,v_price,
   left('Turno fijo · '||v_fixed.client_name||' · '||v_service||' · '||p_occurrence::text,300),
   public.booking_display_label(p_occurrence),p_payment_method,
   p_fixed_id,p_occurrence
 ) RETURNING id INTO v_charge;
 RETURN v_charge;
END;
$complete_fixed$;

REVOKE ALL ON FUNCTION public.complete_fixed_booking_occurrence(uuid,uuid,date,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_fixed_booking_occurrence(uuid,uuid,date,text)
  TO service_role;
REVOKE ALL ON FUNCTION public.guard_completed_fixed_charge()
  FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
