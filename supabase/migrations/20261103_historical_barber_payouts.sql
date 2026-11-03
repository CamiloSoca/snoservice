-- Registered already-delivered weekly payouts should reduce barber debt without
-- entering either an open cash drawer or a previously counted/closed register.
ALTER TABLE public.barber_payouts ALTER COLUMN register_id DROP NOT NULL;
ALTER TABLE public.barber_payouts
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'live_drawer',
  ADD COLUMN IF NOT EXISTS paid_on date,
  ADD COLUMN IF NOT EXISTS week_from date,
  ADD COLUMN IF NOT EXISTS week_to date;
ALTER TABLE public.barber_payouts DROP CONSTRAINT IF EXISTS barber_payouts_method_check;
ALTER TABLE public.barber_payouts
  ADD CONSTRAINT barber_payouts_method_check CHECK (method IN ('cash','transfer','unknown'));
ALTER TABLE public.barber_payouts DROP CONSTRAINT IF EXISTS barber_payouts_source_check;
ALTER TABLE public.barber_payouts
  ADD CONSTRAINT barber_payouts_source_check CHECK (
    (source = 'live_drawer'
     AND register_id IS NOT NULL AND method IN ('cash','transfer')
     AND paid_on IS NULL AND week_from IS NULL AND week_to IS NULL)
    OR
    (source = 'historical_off_drawer'
     AND register_id IS NULL AND method IN ('cash','transfer','unknown')
     AND paid_on IS NOT NULL AND week_from IS NOT NULL AND week_to IS NOT NULL
     AND week_to = week_from + 6 AND EXTRACT(ISODOW FROM week_to) = 6)
  );
COMMENT ON COLUMN public.barber_payouts.source IS
  'live_drawer consumes its register cash/transfer; historical_off_drawer represents an already delivered payment, without any current or historical cash-register movement.';
COMMENT ON COLUMN public.barber_payouts.paid_on IS
  'Actual calendar date of a previously delivered historical weekly payment (not the database recording date).';
