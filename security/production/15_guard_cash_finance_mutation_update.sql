-- QA financiero 22/10/2026: adaptar la validación de UPDATE a cada tabla.
-- Ya ensayado en staging con 33/33 escenarios reversibles.
-- No modifica importes guardados ni reabre cajas.
CREATE OR REPLACE FUNCTION public.guard_cash_finance_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE v_id uuid; v_status text;
BEGIN
  IF TG_TABLE_NAME='appointments' THEN
    IF TG_OP='DELETE' THEN
      IF OLD.status='completado' THEN
        RAISE EXCEPTION 'No se elimina un turno completado; usá un ajuste contable' USING ERRCODE='23514';
      END IF;
      RETURN OLD;
    END IF;
    IF NEW.status='completado' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'completado') THEN
      v_id := public.cash_register_for_finance(NEW.shop_id);
    ELSIF TG_OP='UPDATE' AND OLD.status='completado' AND NEW.status IS DISTINCT FROM 'completado' THEN
      SELECT c.status INTO v_status FROM public.cash_registers c
      WHERE c.id=OLD.completed_cash_register_id FOR SHARE;
      IF v_status IS DISTINCT FROM 'abierta' THEN
        RAISE EXCEPTION 'No se modifica un turno de una caja cerrada' USING ERRCODE='23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP='INSERT' THEN
    v_id := public.cash_register_for_finance(NEW.shop_id);
    IF TG_TABLE_NAME IN ('expenses','tips') THEN
      NEW.cash_register_id := v_id;
    END IF;
    RETURN NEW;
  END IF;

  v_id := OLD.cash_register_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No se puede modificar un movimiento histórico sin caja asociada' USING ERRCODE='23514';
  END IF;
  SELECT c.status INTO v_status FROM public.cash_registers c WHERE c.id=v_id FOR SHARE;
  IF v_status IS DISTINCT FROM 'abierta' THEN
    RAISE EXCEPTION 'La operación pertenece a una caja cerrada' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;

  -- Las tablas de finanzas tienen columnas diferentes.
  -- No evaluar campos de manual_charges al modificar expenses o tips.
  IF TG_TABLE_NAME='manual_charges' THEN
    IF NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.shop_id IS DISTINCT FROM OLD.shop_id
       OR NEW.barber_id IS DISTINCT FROM OLD.barber_id
       OR NEW.cash_register_id IS DISTINCT FROM OLD.cash_register_id
       OR NEW.commission_rate_snapshot IS DISTINCT FROM OLD.commission_rate_snapshot
       OR NEW.barber_earnings_snapshot IS DISTINCT FROM OLD.barber_earnings_snapshot
       OR NEW.business_earnings_snapshot IS DISTINCT FROM OLD.business_earnings_snapshot THEN
      RAISE EXCEPTION 'No se modifica un cobro registrado; eliminá y registrá uno nuevo' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='tips' THEN
    IF NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.shop_id IS DISTINCT FROM OLD.shop_id
       OR NEW.barber_id IS DISTINCT FROM OLD.barber_id
       OR NEW.cash_register_id IS DISTINCT FROM OLD.cash_register_id THEN
      RAISE EXCEPTION 'No se modifica la propina registrada; eliminá y registrá una nueva' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='expenses' THEN
    IF NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.shop_id IS DISTINCT FROM OLD.shop_id
       OR NEW.cash_register_id IS DISTINCT FROM OLD.cash_register_id THEN
      RAISE EXCEPTION 'No se modifica el gasto registrado; eliminá y registrá uno nuevo' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
