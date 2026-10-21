-- SNOSERVICE - índices de rendimiento. REVISAR antes de ejecutar en Supabase.
--
-- Esta migración NO se ejecuta al desplegar la web en Vercel.
-- No altera reservas, su validador de solapamientos, políticas RLS ni datos.
-- Consultar primero los índices existentes (bloque SELECT al final);
-- aplicar los faltantes desde Supabase SQL Editor en una ventana tranquila.
-- Si la tabla ya tiene muchos registros, planear CREATE INDEX CONCURRENTLY
-- por separado y fuera de BEGIN, para evitar bloqueos de escritura.
-- Las rutas actuales trabajan sobre date_string (TEXT), NO appointment_date.

BEGIN;

-- GET /api/public/booking: turnos activos por local y fechas ofrecidas.
-- Complementa el índice único de protección (barbero, fecha, inicio)
-- existente, que NO debe reemplazarse ni eliminarse.
CREATE INDEX IF NOT EXISTS idx_sno_apt_available_shop_date
  ON public.appointments (shop_id, date_string, barber_id, time_slot)
  WHERE status <> 'cancelado';

-- Listados privados por local, con orden descendente de creación.
CREATE INDEX IF NOT EXISTS idx_sno_apt_shop_created
  ON public.appointments (shop_id, created_at DESC);

-- Dashboard de cada barbero: evitar ordenar toda la tabla.
CREATE INDEX IF NOT EXISTS idx_sno_apt_shop_barber_created
  ON public.appointments (shop_id, barber_id, created_at DESC);

-- Propinas y cobros manuales se consultan por local, barbero y fecha.
CREATE INDEX IF NOT EXISTS idx_sno_tips_shop_barber_created
  ON public.tips (shop_id, barber_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sno_charges_shop_barber_created
  ON public.manual_charges (shop_id, barber_id, created_at DESC);

-- Consulta de gastos y flujo de caja.
CREATE INDEX IF NOT EXISTS idx_sno_expenses_shop_date
  ON public.expenses (shop_id, expense_date DESC);

-- Límite de intentos de PIN: shop/action/details/rango temporal.
CREATE INDEX IF NOT EXISTS idx_sno_pin_audit_lookup
  ON public.audit_logs (shop_id, action, details, created_at DESC)
  WHERE action = 'PIN_FAILED';

COMMIT;

-- Verificación después de ejecutar; no guarda ni modifica información.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('appointments','tips','manual_charges','expenses','audit_logs')
ORDER BY tablename, indexname;
