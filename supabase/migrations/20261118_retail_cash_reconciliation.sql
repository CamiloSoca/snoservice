-- Include retail sales in the existing physical cash audit and daily business results.
-- Existing service sales and barber commissions retain their previous logic.

CREATE OR REPLACE FUNCTION public.cash_drawer_snapshot(p_shop_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  c public.cash_registers%ROWTYPE;
  v_cashin numeric := 0;
  v_transferin numeric := 0;
  v_cashout numeric := 0;
  v_transferout numeric := 0;
  v_unknown integer := 0;
  v_cash numeric := 0;
  v_transfer numeric := 0;
  v_missing bigint := 0;
BEGIN
  SELECT * INTO c FROM public.cash_registers
  WHERE shop_id=p_shop_id ORDER BY (status='abierta') DESC,opened_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('cashOpen',false,'registerId',null,'reliable',false); END IF;
  -- Completed services: default payment_method='cash' is NOT trustworthy for old records.
  SELECT COALESCE(SUM(CASE WHEN payment_confirmed_at IS NOT NULL AND payment_method='cash' THEN price_snapshot ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN payment_confirmed_at IS NOT NULL AND payment_method='transfer' THEN price_snapshot ELSE 0 END),0),
         COUNT(*) FILTER(WHERE payment_confirmed_at IS NULL OR payment_method NOT IN ('cash','transfer') OR payment_method IS NULL)
    INTO v_cash,v_transfer,v_missing FROM public.appointments
    WHERE shop_id=p_shop_id AND status='completado' AND completed_cash_register_id=c.id;
  v_cashin:=v_cashin+v_cash;v_transferin:=v_transferin+v_transfer;v_unknown:=v_unknown+v_missing;
  SELECT COALESCE(SUM(amount) FILTER(WHERE payment_method='cash'),0),
         COALESCE(SUM(amount) FILTER(WHERE payment_method='transfer'),0),
         COUNT(*) FILTER(WHERE payment_method IS NULL)
    INTO v_cash,v_transfer,v_missing FROM public.manual_charges
    WHERE shop_id=p_shop_id AND cash_register_id=c.id;
  v_cashin:=v_cashin+v_cash;v_transferin:=v_transferin+v_transfer;v_unknown:=v_unknown+v_missing;
  SELECT COALESCE(SUM(amount) FILTER(WHERE payment_method='cash'),0),
         COALESCE(SUM(amount) FILTER(WHERE payment_method='transfer'),0),
         COUNT(*) FILTER(WHERE payment_method IS NULL)
    INTO v_cash,v_transfer,v_missing FROM public.tips
    WHERE shop_id=p_shop_id AND cash_register_id=c.id;
  v_cashin:=v_cashin+v_cash;v_transferin:=v_transferin+v_transfer;v_unknown:=v_unknown+v_missing;
  -- Product sales belong to the business, with no service commission.
  SELECT COALESCE(SUM(amount) FILTER(WHERE payment_method='cash'),0),
         COALESCE(SUM(amount) FILTER(WHERE payment_method='transfer'),0)
    INTO v_cash,v_transfer FROM public.retail_sales
    WHERE shop_id=p_shop_id AND register_id=c.id;
  v_cashin:=v_cashin+v_cash;v_transferin:=v_transferin+v_transfer;

  SELECT COALESCE(SUM(amount) FILTER(WHERE payment_method='cash'),0),
         COALESCE(SUM(amount) FILTER(WHERE payment_method='transfer'),0),
         COUNT(*) FILTER(WHERE payment_method IS NULL)
    INTO v_cash,v_transfer,v_missing FROM public.expenses
    WHERE shop_id=p_shop_id AND (cash_register_id=c.id OR
      (cash_register_id IS NULL AND created_at>=c.opened_at AND created_at<=COALESCE(c.closed_at,now())));
  v_cashout:=v_cashout+v_cash;v_transferout:=v_transferout+v_transfer;v_unknown:=v_unknown+v_missing;
  SELECT COALESCE(SUM(amount) FILTER(WHERE method='cash'),0),
         COALESCE(SUM(amount) FILTER(WHERE method='transfer'),0)
    INTO v_cash,v_transfer FROM public.barber_payouts
    WHERE shop_id=p_shop_id AND register_id=c.id;
  v_cashout:=v_cashout+v_cash;v_transferout:=v_transferout+v_transfer;
  SELECT COALESCE(SUM(amount) FILTER(WHERE method='cash'),0),
         COALESCE(SUM(amount) FILTER(WHERE method='transfer'),0)
    INTO v_cash,v_transfer FROM public.owner_draws
    WHERE shop_id=p_shop_id AND register_id=c.id;
  v_cashout:=v_cashout+v_cash;v_transferout:=v_transferout+v_transfer;
  RETURN jsonb_build_object(
    'registerId',c.id,'cashOpen',c.status='abierta','openedAt',c.opened_at,
    'openingVerified',c.opening_verified,'openingCash',c.initial_amount,
    'cashIn',v_cashin,'transferIn',v_transferin,
    'cashOut',v_cashout,'transferOut',v_transferout,
    'expectedCash',COALESCE(c.initial_amount,0)+v_cashin-v_cashout,
    'unclassified',v_unknown,
    'reliable',c.opening_verified AND v_unknown=0,
    'closingCounted',c.closing_counted,'cashVariance',c.cash_variance);
END;$function$;


CREATE OR REPLACE FUNCTION public.close_cash_financial(p_shop_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
 v_cash public.cash_registers%ROWTYPE;
 v_gross numeric := 0;
 v_commissions numeric := 0;
 v_expenses numeric := 0;
 v_tips numeric := 0;
 v_net numeric := 0;
 v_bookings numeric := 0;
 v_manual numeric := 0;
 v_retail numeric := 0;
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
 -- Retail receipts enter business revenue, never barber commission.
 SELECT COALESCE(SUM(rs.amount),0) INTO v_retail
 FROM public.retail_sales rs
 WHERE rs.shop_id=p_shop_id AND rs.register_id=v_cash.id;
 v_gross:=v_gross+v_retail;
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
   'tips',v_tips,'completedAppointments',v_bookings,'manualCharges',v_manual,
   'retailSales',v_retail);
END;
$function$;
