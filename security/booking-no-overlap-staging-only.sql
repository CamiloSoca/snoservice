-- STAGING ONLY: exclusion constraint para reservas simultaneas o solapadas.
-- Ejecutar solo en Supabase STAGING vjtwvhdiypfxgodhnjiw.
-- No borra ni actualiza turnos. Si hay solapamientos historicos activos, falla
-- y revierte todos los cambios hechos por este archivo.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Operadores GiST de igualdad para UUID y TEXT.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.appointments
    WHERE status IS DISTINCT FROM 'cancelado'
      AND (time_slot !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
           OR COALESCE(duration_minutes, 0) <= 0
           OR shop_id IS NULL OR barber_id IS NULL OR date_string IS NULL)
  ) THEN
    RAISE EXCEPTION 'Hay reservas activas con hora, duracion o referencias invalidas: revisar antes de aplicar la exclusion.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.appointments'::regclass
      AND conname = 'appointments_no_active_overlap'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_no_active_overlap
      EXCLUDE USING gist (
        shop_id WITH =,
        barber_id WITH =,
        date_string WITH =,
        int4range(
          substring(time_slot, 1, 2)::integer * 60 + substring(time_slot, 4, 2)::integer,
          substring(time_slot, 1, 2)::integer * 60 + substring(time_slot, 4, 2)::integer + COALESCE(duration_minutes, 60),
          '[)'
        ) WITH &&
      )
      WHERE (status IS DISTINCT FROM 'cancelado');
  END IF;
END $$;

COMMIT;

-- Confirmar definicion:
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'public.appointments'::regclass
  AND conname = 'appointments_no_active_overlap';
