-- Ajuste de mínimos privilegios: las APIs solo consultan las anotaciones.
-- La corrección de registros históricos sigue realizándose mediante migración.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.manual_charge_service_annotations FROM service_role;
GRANT SELECT ON TABLE public.manual_charge_service_annotations TO service_role;
