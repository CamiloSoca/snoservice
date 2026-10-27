-- Índices de soporte para las claves foráneas del módulo de abonos.
-- Revisado contra la estructura aplicada en STAGING (2026-10-26).
CREATE INDEX IF NOT EXISTS fixed_monthly_periods_shop_manual_charge_idx
  ON public.fixed_monthly_periods(shop_id, manual_charge_id);

CREATE INDEX IF NOT EXISTS fixed_monthly_uses_period_shop_fixed_idx
  ON public.fixed_monthly_uses(period_id, shop_id, fixed_booking_id);
