-- Permitir una nueva reserva el mismo día cuando las anteriores ya
-- terminaron o se cancelaron, sin cambiar el historial ni los movimientos de caja.
-- Mantener una sola reserva CONFIRMADA por celular y día.
--
-- Sustitución mínima, idempotente y protegida por una comprobación de esquema.
-- Preserva las demás validaciones y el search_path de la función ya desplegada.
DO $booking_guard$
DECLARE
  definition text;
  old_rule constant text := 'AND a.status IS DISTINCT FROM ''cancelado''';
  new_rule constant text := 'AND a.status = ''confirmado''';
BEGIN
  SELECT pg_get_functiondef('public.validate_appointment_booking()'::regprocedure)
    INTO definition;

  IF definition IS NULL THEN
    RAISE EXCEPTION 'No se encontró validate_appointment_booking()';
  END IF;

  IF strpos(definition, new_rule) > 0 AND strpos(definition, old_rule) = 0 THEN
    RAISE NOTICE 'La regla de reservas completadas ya estaba aplicada';
    RETURN;
  END IF;

  IF strpos(definition, old_rule) = 0 OR
     (length(definition) - length(replace(definition, old_rule, ''))) / length(old_rule) <> 1 THEN
    RAISE EXCEPTION 'El esquema de validación cambió. No aplicar actualización automática';
  END IF;

  EXECUTE replace(definition, old_rule, new_rule);
END
$booking_guard$;
