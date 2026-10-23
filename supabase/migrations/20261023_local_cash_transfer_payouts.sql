-- Ledger de liquidaciones con acceso exclusivo al servidor. Etapa de staging.
-- Solo se aceptan pagos en efectivo o transferencia realizados en el local.
CREATE TABLE IF NOT EXISTS public.barber_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  barber_id uuid NOT NULL REFERENCES public.barbers(id),
  register_id uuid NOT NULL REFERENCES public.cash_registers(id),
  request_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('cash','transfer')),
  note text NOT NULL DEFAULT '',
  approved_by text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT barber_payouts_idempotency UNIQUE (shop_id,request_id)
);
CREATE INDEX IF NOT EXISTS barber_payouts_shop_barber_idx
  ON public.barber_payouts (shop_id,barber_id,created_at DESC);
ALTER TABLE public.barber_payouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.barber_payouts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.barber_payouts TO service_role;

-- Lectura aislada: no se expone una vista que omita RLS ni información de clientes.
-- snapshots históricos jamás se recalculan con el porcentaje actual.
CREATE OR REPLACE FUNCTION public.finance_barber_balances(p_shop_id uuid, p_barber_id uuid DEFAULT NULL)
RETURNS TABLE (
  barber_id uuid, barber_name text, is_owner boolean,
  earned numeric, paid numeric, outstanding numeric
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, public
AS $$
  WITH e AS (
    SELECT a.barber_id, COALESCE(sum(a.barber_earnings_snapshot),0) AS amount
    FROM public.appointments a
    WHERE a.shop_id=p_shop_id AND a.status='completado'
    GROUP BY a.barber_id
    UNION ALL
    SELECT m.barber_id, COALESCE(sum(m.barber_earnings_snapshot),0)
    FROM public.manual_charges m
    WHERE m.shop_id=p_shop_id
    GROUP BY m.barber_id
    UNION ALL
    SELECT t.barber_id, COALESCE(sum(t.amount),0)
    FROM public.tips t
    WHERE t.shop_id=p_shop_id
    GROUP BY t.barber_id
  ),
  totals AS (
    SELECT e.barber_id, round(COALESCE(sum(e.amount),0),2) AS earned
    FROM e GROUP BY e.barber_id
  ),
  payments AS (
    SELECT p.barber_id, round(COALESCE(sum(p.amount),0),2) AS paid
    FROM public.barber_payouts p
    WHERE p.shop_id=p_shop_id GROUP BY p.barber_id
  )
  SELECT b.id, b.name, b.is_owner,
         CASE WHEN b.is_owner THEN 0::numeric ELSE COALESCE(t.earned,0) END,
         COALESCE(p.paid,0),
         CASE WHEN b.is_owner THEN 0::numeric ELSE COALESCE(t.earned,0)-COALESCE(p.paid,0) END
  FROM public.barbers b
  LEFT JOIN totals t ON t.barber_id=b.id
  LEFT JOIN payments p ON p.barber_id=b.id
  WHERE b.shop_id=p_shop_id AND (p_barber_id IS NULL OR b.id=p_barber_id)
  ORDER BY b.name;
$$;
REVOKE ALL ON FUNCTION public.finance_barber_balances(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finance_barber_balances(uuid,uuid) TO service_role;

-- Traba por barbero: dos pagos simultáneos jamás pueden gastar el mismo saldo.
-- No borra ni modifica payouts anteriores; doble clic por request_id es idempotente.
CREATE OR REPLACE FUNCTION public.record_barber_payout(
 p_shop_id uuid, p_barber_id uuid, p_amount numeric,
 p_method text, p_request_id uuid, p_note text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_barber public.barbers%ROWTYPE;
  v_register public.cash_registers%ROWTYPE;
  v_prior public.barber_payouts%ROWTYPE;
  v_balance numeric;
  v_payment public.barber_payouts%ROWTYPE;
BEGIN
  IF p_shop_id IS NULL OR p_barber_id IS NULL OR p_request_id IS NULL
    OR p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount,2)
    OR p_method NOT IN ('cash','transfer') OR p_method IS NULL THEN
    RAISE EXCEPTION 'Datos de pago inválidos' USING ERRCODE='22023';
  END IF;
  IF length(coalesce(p_note,'')) > 180 THEN
    RAISE EXCEPTION 'Nota demasiado larga' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_barber FROM public.barbers
    WHERE shop_id=p_shop_id AND id=p_barber_id FOR UPDATE;
  IF NOT FOUND OR v_barber.is_owner THEN
    RAISE EXCEPTION 'Barbero inválido o propietario' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_prior FROM public.barber_payouts
    WHERE shop_id=p_shop_id AND request_id=p_request_id LIMIT 1;
  IF FOUND THEN
    IF v_prior.barber_id<>p_barber_id OR v_prior.amount<>p_amount OR
       v_prior.method<>p_method OR v_prior.note<>coalesce(p_note,'') THEN
      RAISE EXCEPTION 'Clave de pago ya utilizada con otros datos' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('id',v_prior.id,'repeated',true,'amount',v_prior.amount,
      'method',v_prior.method,'barberId',v_prior.barber_id);
  END IF;

  SELECT f.outstanding INTO v_balance
    FROM public.finance_barber_balances(p_shop_id,p_barber_id) f;
  IF v_balance IS NULL OR v_balance < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente para el retiro' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_register FROM public.cash_registers
    WHERE shop_id=p_shop_id AND status='abierta'
    ORDER BY opened_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Abrí la caja antes de registrar un pago' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.barber_payouts
    (shop_id,barber_id,register_id,request_id,amount,method,note,approved_by)
  VALUES(p_shop_id,p_barber_id,v_register.id,p_request_id,p_amount,p_method,
    coalesce(p_note,''),'admin')
  RETURNING * INTO v_payment;

  RETURN jsonb_build_object('id',v_payment.id,'repeated',false,
    'barberId',v_payment.barber_id,'amount',v_payment.amount,'method',v_payment.method);
END
$$;
REVOKE ALL ON FUNCTION public.record_barber_payout(uuid,uuid,numeric,text,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_barber_payout(uuid,uuid,numeric,text,uuid,text)
  TO service_role;
