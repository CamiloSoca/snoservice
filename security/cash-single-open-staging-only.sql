-- EXCLUSIVAMENTE PARA STAGING: snoservices-stating (vjtwvhdiypfxgodhnjiw).
-- Evita dos cajas abiertas simultáneamente para un mismo shop_id.
-- No ejecutar en la base de producción sin validación y autorización explícita.
-- El precontrol aborta si ya hay cajas abiertas duplicadas.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.cash_registers
    WHERE status = 'abierta' AND shop_id IS NOT NULL
    GROUP BY shop_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Hay cajas abiertas duplicadas: revisar antes de instalar el indice';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS cash_registers_one_open_per_shop
  ON public.cash_registers (shop_id)
  WHERE status = 'abierta';

COMMIT;

-- Comprobaciones de solo lectura:
-- SELECT shop_id, count(*) FROM public.cash_registers
-- WHERE status = 'abierta' GROUP BY shop_id;
-- SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public'
-- AND indexname='cash_registers_one_open_per_shop';
