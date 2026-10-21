-- PREPARADO PARA PRODUCCIÓN, NO EJECUTADO.
-- La exclusión toma un bloqueo DDL; ensayar duración sobre un clon primero.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
DO $check$
BEGIN
  IF EXISTS (SELECT 1 FROM public.appointments
      WHERE status IS DISTINCT FROM 'cancelado' AND
        (time_slot !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR
         COALESCE(duration_minutes,0)<=0 OR shop_id IS NULL OR barber_id IS NULL)) THEN
    RAISE EXCEPTION 'Reservas activas con datos inválidos; resolver antes de migrar';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cash_registers
      WHERE status='abierta' GROUP BY shop_id HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Hay más de una caja abierta por local';
  END IF;
END;
$check$;
CREATE UNIQUE INDEX IF NOT EXISTS cash_registers_one_open_per_shop
  ON public.cash_registers(shop_id) WHERE status='abierta';
DO $constraint$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid='public.appointments'::regclass
        AND conname='appointments_no_active_overlap') THEN
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_no_active_overlap
      EXCLUDE USING gist (
        shop_id WITH =,
        barber_id WITH =,
        date_string WITH =,
        int4range(substring(time_slot,1,2)::int*60+substring(time_slot,4,2)::int,
                  substring(time_slot,1,2)::int*60+substring(time_slot,4,2)::int+
                    COALESCE(duration_minutes,60),'[)') WITH &&
      ) WHERE (status IS DISTINCT FROM 'cancelado');
  END IF;
END;
$constraint$;
COMMIT;
