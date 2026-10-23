-- Cash-drawer reconciliation, on-site cash/transfer transactions, owner draws.
-- Additive schema: keep historic final_amount as BUSINESS result, never cash drawer.
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz;
ALTER TABLE public.manual_charges ADD COLUMN IF NOT EXISTS payment_method text CHECK(payment_method IN ('cash','transfer'));
ALTER TABLE public.tips ADD COLUMN IF NOT EXISTS payment_method text CHECK(payment_method IN ('cash','transfer'));
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS payment_method text CHECK(payment_method IN ('cash','transfer'));
ALTER TABLE public.cash_registers ADD COLUMN IF NOT EXISTS opening_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.cash_registers ADD COLUMN IF NOT EXISTS closing_counted numeric(12,2) CHECK(closing_counted>=0);
ALTER TABLE public.cash_registers ADD COLUMN IF NOT EXISTS expected_cash numeric(12,2);
ALTER TABLE public.cash_registers ADD COLUMN IF NOT EXISTS cash_variance numeric(12,2);
ALTER TABLE public.cash_registers ADD COLUMN IF NOT EXISTS cash_in numeric(12,2);
ALTER TABLE public.cash_registers ADD COLUMN IF NOT EXISTS cash_out numeric(12,2);
ALTER TABLE public.cash_registers ADD COLUMN IF NOT EXISTS transfer_in numeric(12,2);
-- Existing sessions are unverified until manually reconciled. No retroactive "cash" guess.

CREATE TABLE IF NOT EXISTS public.owner_draws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  register_id uuid NOT NULL REFERENCES public.cash_registers(id),
  request_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('cash','transfer')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT owner_draws_idempotency UNIQUE (shop_id,request_id)
);
CREATE INDEX IF NOT EXISTS owner_draws_register_idx ON public.owner_draws(register_id,created_at DESC);
ALTER TABLE public.owner_draws ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_draws FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.owner_draws TO service_role;

CREATE OR REPLACE FUNCTION public.cash_drawer_snapshot(p_shop_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO pg_catalog,public
AS $fn$
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
END;$fn$;
REVOKE ALL ON FUNCTION public.cash_drawer_snapshot(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cash_drawer_snapshot(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.record_owner_draw(
 p_shop_id uuid,p_amount numeric,p_method text,p_request_id uuid,p_note text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO pg_catalog,public
AS $fn$
DECLARE
 c public.cash_registers%ROWTYPE;
 prior public.owner_draws%ROWTYPE;
 created public.owner_draws%ROWTYPE;
 snap jsonb;
BEGIN
 IF p_amount IS NULL OR p_amount<=0 OR p_amount<>round(p_amount,2)
    OR p_method IS NULL OR p_method NOT IN ('cash','transfer')
    OR p_shop_id IS NULL OR p_request_id IS NULL OR length(COALESCE(p_note,''))>180
 THEN RAISE EXCEPTION 'Datos de retiro inválidos' USING ERRCODE='22023'; END IF;
 SELECT * INTO c FROM public.cash_registers
 WHERE shop_id=p_shop_id AND status='abierta' ORDER BY opened_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'No hay caja abierta' USING ERRCODE='23514'; END IF;
 SELECT * INTO prior FROM public.owner_draws WHERE shop_id=p_shop_id AND request_id=p_request_id;
 IF FOUND THEN
   IF prior.amount<>p_amount OR prior.method<>p_method OR prior.note<>COALESCE(p_note,'') THEN
     RAISE EXCEPTION 'Solicitud duplicada con datos diferentes' USING ERRCODE='23505'; END IF;
   RETURN jsonb_build_object('id',prior.id,'repeated',true,'amount',prior.amount,'method',prior.method);
 END IF;
 IF p_method='cash' THEN
   snap:=public.cash_drawer_snapshot(p_shop_id);
   IF (snap->>'reliable')::boolean IS DISTINCT FROM true THEN
     RAISE EXCEPTION 'Arqueo inicial o movimientos sin clasificar' USING ERRCODE='23514'; END IF;
   IF (snap->>'expectedCash')::numeric < p_amount THEN
     RAISE EXCEPTION 'Efectivo insuficiente' USING ERRCODE='23514'; END IF;
 END IF;
 INSERT INTO public.owner_draws(shop_id,register_id,request_id,amount,method,note)
 VALUES(p_shop_id,c.id,p_request_id,p_amount,p_method,COALESCE(p_note,''))
 RETURNING * INTO created;
 RETURN jsonb_build_object('id',created.id,'repeated',false,'amount',created.amount,'method',created.method);
END;$fn$;
REVOKE ALL ON FUNCTION public.record_owner_draw(uuid,numeric,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_owner_draw(uuid,numeric,text,uuid,text) TO service_role;

-- Enforce physical cash coverage for barber payouts (barber balances already checked by v1 RPC).
CREATE OR REPLACE FUNCTION public.record_barber_payout(
 p_shop_id uuid, p_barber_id uuid, p_amount numeric,
 p_method text, p_request_id uuid, p_note text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO pg_catalog,public
AS $fn$
DECLARE
 v_barber public.barbers%ROWTYPE;
 v_register public.cash_registers%ROWTYPE;
 v_prior public.barber_payouts%ROWTYPE;
 v_balance numeric;
 v_payment public.barber_payouts%ROWTYPE;
 snap jsonb;
BEGIN
 IF p_shop_id IS NULL OR p_barber_id IS NULL OR p_request_id IS NULL
 OR p_amount IS NULL OR p_amount<=0 OR p_amount<>round(p_amount,2)
 OR p_method IS NULL OR p_method NOT IN ('cash','transfer')
 OR length(COALESCE(p_note,''))>180 THEN
   RAISE EXCEPTION 'Datos de pago inválidos' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_barber FROM public.barbers
 WHERE shop_id=p_shop_id AND id=p_barber_id FOR UPDATE;
 IF NOT FOUND OR v_barber.is_owner THEN
   RAISE EXCEPTION 'Barbero inválido o propietario' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_register FROM public.cash_registers
 WHERE shop_id=p_shop_id AND status='abierta' ORDER BY opened_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Abrí caja antes de pagar' USING ERRCODE='23514'; END IF;
 SELECT * INTO v_prior FROM public.barber_payouts
 WHERE shop_id=p_shop_id AND request_id=p_request_id;
 IF FOUND THEN
  IF v_prior.barber_id<>p_barber_id OR v_prior.amount<>p_amount
    OR v_prior.method<>p_method OR v_prior.note<>COALESCE(p_note,'') THEN
    RAISE EXCEPTION 'Clave duplicada con otros datos' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('id',v_prior.id,'repeated',true,'amount',v_prior.amount,'method',v_prior.method);
 END IF;
 SELECT f.outstanding INTO v_balance FROM public.finance_barber_balances(p_shop_id,p_barber_id) f;
 IF v_balance IS NULL OR v_balance < p_amount THEN
  RAISE EXCEPTION 'Saldo insuficiente' USING ERRCODE='23514'; END IF;
 IF p_method='cash' THEN
  snap:=public.cash_drawer_snapshot(p_shop_id);
  IF (snap->>'reliable')::boolean IS DISTINCT FROM true
  OR (snap->>'expectedCash')::numeric < p_amount THEN
    RAISE EXCEPTION 'Arqueo incompleto o efectivo insuficiente' USING ERRCODE='23514'; END IF;
 END IF;
 INSERT INTO public.barber_payouts(shop_id,barber_id,register_id,request_id,amount,method,note,approved_by)
 VALUES(p_shop_id,p_barber_id,v_register.id,p_request_id,p_amount,p_method,COALESCE(p_note,''),'admin')
 RETURNING * INTO v_payment;
 RETURN jsonb_build_object('id',v_payment.id,'repeated',false,'amount',v_payment.amount,'method',v_payment.method);
END;$fn$;
REVOKE ALL ON FUNCTION public.record_barber_payout(uuid,uuid,numeric,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_barber_payout(uuid,uuid,numeric,text,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.close_cash_reconciled(p_shop_id uuid,p_counted_cash numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO pg_catalog,public
AS $fn$
DECLARE
 c public.cash_registers%ROWTYPE;
 snap jsonb;
 economics jsonb;
 expected numeric;
 delta numeric;
BEGIN
 IF p_counted_cash IS NULL OR p_counted_cash<0 OR p_counted_cash<>round(p_counted_cash,2) THEN
  RAISE EXCEPTION 'Importe contado inválido' USING ERRCODE='22023'; END IF;
 SELECT * INTO c FROM public.cash_registers
 WHERE shop_id=p_shop_id AND status='abierta' ORDER BY opened_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'No hay caja abierta' USING ERRCODE='23514'; END IF;
 snap:=public.cash_drawer_snapshot(p_shop_id);
 IF (snap->>'reliable')::boolean IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Revisá saldo inicial y movimientos sin método de pago' USING ERRCODE='23514'; END IF;
 expected:=(snap->>'expectedCash')::numeric;
 delta:=p_counted_cash-expected;
 economics:=public.close_cash_financial(p_shop_id);
 UPDATE public.cash_registers
  SET closing_counted=p_counted_cash,expected_cash=expected,cash_variance=delta,
      cash_in=(snap->>'cashIn')::numeric,cash_out=(snap->>'cashOut')::numeric,
      transfer_in=(snap->>'transferIn')::numeric
 WHERE id=c.id;
 RETURN economics || jsonb_build_object('expectedCash',expected,'countedCash',p_counted_cash,
      'difference',delta,'cashIn',snap->'cashIn','cashOut',snap->'cashOut',
      'transferIn',snap->'transferIn','physicalCashVerified',true);
END;$fn$;
REVOKE ALL ON FUNCTION public.close_cash_reconciled(uuid,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_reconciled(uuid,numeric) TO service_role;
