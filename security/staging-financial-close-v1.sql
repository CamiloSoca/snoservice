-- STAGING ONLY: atomic financial close and cash-register attribution.
-- This is an economic closing statement, not a physical cash drawer count.
BEGIN;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS cash_register_id uuid REFERENCES public.cash_registers(id);
ALTER TABLE public.tips ADD COLUMN IF NOT EXISTS cash_register_id uuid REFERENCES public.cash_registers(id);

CREATE OR REPLACE FUNCTION public.cash_register_for_finance(p_shop_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $fn$
DECLARE v_id uuid;
BEGIN
 SELECT c.id INTO v_id FROM public.cash_registers c
 WHERE c.shop_id=p_shop_id AND c.status='abierta'
 ORDER BY c.opened_at DESC LIMIT 1 FOR SHARE;
 IF v_id IS NULL THEN RAISE EXCEPTION 'Debe existir una caja abierta' USING ERRCODE='23514'; END IF;
 RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.guard_cash_finance_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog, public AS $fn$
DECLARE v_id uuid; v_status text;
BEGIN
 IF TG_TABLE_NAME='appointments' THEN
   IF TG_OP='DELETE' THEN
     IF OLD.status='completado' THEN RAISE EXCEPTION 'No se elimina un turno completado; usá un ajuste contable' USING ERRCODE='23514'; END IF;
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
 -- A register-owned transaction can only change while its register is open.
 v_id := OLD.cash_register_id;
 IF v_id IS NULL THEN
   RAISE EXCEPTION 'No se puede modificar un movimiento histórico sin caja asociada' USING ERRCODE='23514';
 END IF;
 SELECT c.status INTO v_status FROM public.cash_registers c WHERE c.id=v_id FOR SHARE;
 IF v_status IS DISTINCT FROM 'abierta' THEN
   RAISE EXCEPTION 'La operación pertenece a una caja cerrada' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 -- Snapshot amounts cannot be changed via UPDATE.
 IF TG_TABLE_NAME='manual_charges' AND
   (NEW.amount IS DISTINCT FROM OLD.amount OR NEW.barber_id IS DISTINCT FROM OLD.barber_id OR
    NEW.barber_earnings_snapshot IS DISTINCT FROM OLD.barber_earnings_snapshot OR
    NEW.business_earnings_snapshot IS DISTINCT FROM OLD.business_earnings_snapshot OR
    NEW.cash_register_id IS DISTINCT FROM OLD.cash_register_id) THEN
   RAISE EXCEPTION 'No se modifica un cobro registrado; eliminá y registrá uno nuevo' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME IN ('expenses','tips') AND
   (NEW.amount IS DISTINCT FROM OLD.amount OR NEW.cash_register_id IS DISTINCT FROM OLD.cash_register_id) THEN
   RAISE EXCEPTION 'No se modifica el importe registrado; eliminá y registrá uno nuevo' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_cash_lock_on_completed_appointment ON public.appointments;
CREATE TRIGGER trg_cash_lock_on_completed_appointment BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.guard_cash_finance_mutation();
DROP TRIGGER IF EXISTS trg_no_delete_completed_appointment ON public.appointments;
CREATE TRIGGER trg_no_delete_completed_appointment BEFORE DELETE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.guard_cash_finance_mutation();

DROP TRIGGER IF EXISTS trg_cash_guard_manual_charges ON public.manual_charges;
CREATE TRIGGER trg_cash_guard_manual_charges BEFORE INSERT OR UPDATE OR DELETE ON public.manual_charges
FOR EACH ROW EXECUTE FUNCTION public.guard_cash_finance_mutation();

DROP TRIGGER IF EXISTS trg_cash_guard_expenses ON public.expenses;
CREATE TRIGGER trg_cash_guard_expenses BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.guard_cash_finance_mutation();

DROP TRIGGER IF EXISTS trg_cash_guard_tips ON public.tips;
CREATE TRIGGER trg_cash_guard_tips BEFORE INSERT OR UPDATE OR DELETE ON public.tips
FOR EACH ROW EXECUTE FUNCTION public.guard_cash_finance_mutation();

CREATE OR REPLACE FUNCTION public.close_cash_financial(p_shop_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog, public
AS $fn$
DECLARE
 v_cash public.cash_registers%ROWTYPE;
 v_gross numeric := 0;
 v_commissions numeric := 0;
 v_expenses numeric := 0;
 v_tips numeric := 0;
 v_net numeric := 0;
 v_bookings numeric := 0;
 v_manual numeric := 0;
BEGIN
 SELECT c.* INTO v_cash FROM public.cash_registers c
 WHERE c.shop_id=p_shop_id AND c.status='abierta'
 ORDER BY c.opened_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'No existe una caja abierta' USING ERRCODE='P0002'; END IF;
 SELECT COUNT(*), COALESCE(SUM(a.price_snapshot),0), COALESCE(SUM(a.barber_earnings_snapshot),0)
 INTO v_bookings,v_gross,v_commissions
 FROM public.appointments a
 WHERE a.shop_id=p_shop_id AND a.completed_cash_register_id=v_cash.id AND a.status='completado';
 SELECT COUNT(*),v_gross+COALESCE(SUM(m.amount),0),v_commissions+COALESCE(SUM(m.barber_earnings_snapshot),0)
 INTO v_manual,v_gross,v_commissions
 FROM public.manual_charges m WHERE m.shop_id=p_shop_id AND m.cash_register_id=v_cash.id;
 SELECT COALESCE(SUM(e.amount),0) INTO v_expenses
 FROM public.expenses e WHERE e.shop_id=p_shop_id AND
 (e.cash_register_id=v_cash.id OR (e.cash_register_id IS NULL AND e.created_at >= v_cash.opened_at AND e.created_at <= now()));
 SELECT COALESCE(SUM(t.amount),0) INTO v_tips
 FROM public.tips t WHERE t.shop_id=p_shop_id AND t.cash_register_id=v_cash.id;
 v_net := v_gross - v_commissions - v_expenses;
 UPDATE public.cash_registers
 SET status='cerrada',closed_at=now(),total_sales=v_gross,total_expenses=v_expenses,final_amount=v_net
 WHERE id=v_cash.id;
 RETURN jsonb_build_object('registerId',v_cash.id,'grossSales',v_gross,'barberCommissions',v_commissions,
   'fundBeforeExpenses',v_gross-v_commissions,'expenses',v_expenses,'fundNet',v_net,
   'tips',v_tips,'completedAppointments',v_bookings,'manualCharges',v_manual);
END;
$fn$;

REVOKE ALL ON FUNCTION public.cash_register_for_finance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cash_register_for_finance(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.guard_cash_finance_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_cash_finance_mutation() TO service_role;
REVOKE ALL ON FUNCTION public.close_cash_financial(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_financial(uuid) TO service_role;
COMMIT;