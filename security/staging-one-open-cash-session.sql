-- STAGING: a cash session may be reopened on the same date, but never have two open sessions simultaneously.
CREATE UNIQUE INDEX IF NOT EXISTS cash_registers_one_open_per_shop_staging
  ON public.cash_registers (shop_id)
  WHERE status = 'abierta';
