# SNOSERVICE · Libro financiero v2 (diseño antes de activar pagos)

Estado: propuesta técnica. **No desplegada y sin alterar movimientos de producción.**

## Hechos comprobados (23-10-2026)
- Los turnos completados y cobros manuales tienen snapshots inmutables: `price_snapshot`, `barber_earnings_snapshot`, `business_earnings_snapshot`, y `completed_cash_register_id` para turnos.
- La función `close_cash_financial` calcula el fondo común neto como ventas − comisiones − gastos; el cálculo **no incluye** `initial_amount`.
- No se registra el medio de pago de cada servicio/cobro manual ni un libro de pagos de comisiones por barbero.
- `Adelantos / Sueldos` existe como categoría de gasto, pero no equivale a una liquidación trazable ni debe imputarse automáticamente a comisiones ya devengadas.
- La cuenta del dueño (`is_owner`) se registra con comisión 0: un retiro personal del dueño debe contabilizarse como retiro de propietario, nunca comisión salarial ni gasto operativo.

## Modelo propuesto: cuatro saldos distintos

1. **Devengado para cada barbero**: comisiones de turnos completados (snapshots) + comisiones de cobros manuales (snapshots) + propinas acreditadas + ajustes justificados.
2. **Pagado al barbero**: desembolsos confirmados en un libro inmutable (`barber_payouts`), asociados a medio de pago, caja si fue efectivo, persona que aprobó, fecha e idempotency key. Una solicitud del barbero no es todavía un pago.
3. **Saldo pendiente del barbero**: devengado − pagado. Se arrastra entre jornadas aunque se cierre caja. No se recalcula con el porcentaje de comisión actual: usar snapshots originales.
4. **Efectivo en caja**: efectivo contado al abrir + cobros en efectivo + ingresos de efectivo − gastos pagados en efectivo − retiros en efectivo de barberos − retiros en efectivo del dueño − devoluciones. No incluye transferencias/tarjetas ni el mero devengo de la comisión.

El **resultado económico del negocio** es otra cifra: ingresos devengados − comisiones devengadas − gastos operativos; no se reduce por pagar una comisión que ya fue descontada del resultado. Distinguir flujos de caja de reconocimiento económico.

## Flujo recomendado

1. Cliente paga servicio: registrar `payment_method = cash | transfer | card`, importe y referencia. Marcar servicio completado no implica automáticamente que fue pagado; el cobro debe quedar conciliado.
2. Se realiza un corte: inmutables el precio y la comisión de ese corte. El saldo devengado del barbero sube aunque aún no retire.
3. El barbero ve `Generado / Pagado / Pendiente` y, opcionalmente, solicita retiro. Nunca puede marcarse como «pagado» él mismo.
4. El administrador confirma una entrega: ingresar monto, medio (efectivo/transferencia), referencia, y generar **un único** pago con idempotency key. Bloquear monto mayor al saldo pendiente y garantizar atomicidad ante dos sesiones o dos clics.
5. Si es efectivo: asociar a la caja abierta y descontarlo **una vez** del saldo físico. Si es transferencia: no tocar cajón. Si se anula, crear contramovimiento con auditoría; no borrar el original.
6. El cierre muestra `Saldo inicial contado / Cobros cash / Salidas cash / Saldo esperado / Saldo contado / Diferencia`. El saldo inicial de mañana será el monto realmente contado que quedó en caja, NO el «fondo neto» de ganancias de hoy.
7. La caja puede cerrar aunque queden comisiones adeudadas; el saldo pendiente del barbero continúa al día siguiente. Pagos que no caben en el efectivo no se habilitan; se ofrece transferencia.

## Esquema sugerido (primero staging)

- `payments`: ingreso por servicio o cobro manual, `amount, method, appointment_id?, charge_id?, register_id?, external_ref, created_at`.
- `barber_payouts`: registro inmutable por barbero con `amount, method, register_id?, approved_by, idempotency_key, created_at`, unicidad (shop,idempotency_key).
- `cash_movements`: ingresos/salidas explícitos, categoría, medio efectivo, caja y referencia a payout/gasto/retiro de propietario, con unicidad de referencia.
- `barber_balance_adjustments`: regularización inicial supervisada y justificada, sin recalcular retrospectivamente pagos históricos. Debe registrar quién aprobó.
- `cash_registers`: agregar `opening_counted`, `closing_counted`, `expected_cash`, `difference`; no reinterpretar `final_amount` existente sin migración/compatibilidad.

RLS activada sin políticas de acceso público para movimientos privados; endpoints server-only con verificación de administrador y CSRF. Barbero únicamente consulta su estado mediante el ID de la sesión firmada, jamás un ID enviado por el cliente. RPC de payout con bloqueo transaccional y `SECURITY INVOKER`, accesible solo a `service_role`.

## Pruebas obligatorias

- Dos retiros simultáneos del último saldo disponible: solo uno confirma.
- Doble clic con misma clave idempotente: un único movimiento.
- Comisión de 50% sobre $400 = $200 devengados; retiro de $100 deja $100 pendientes sin alterar la ganancia devengada del negocio.
- $1.000 de caja inicial + $400 cobrados en efectivo − $200 entregados al barbero = $1.200 físicos esperados, salvo gastos y movimientos adicionales.
- $400 por transferencia: el efectivo no aumenta aunque los ingresos y el devengado sí.
- Caja cerrada: impedir retiro de efectivo asociado a ella; transferencia sigue circuito propio.
- Ausencia de permisos: barbero no puede forzar pago ni consultar saldos de otro.
- Comisiones antiguas, adelantos y propinas anteriores: conciliación manual de apertura; **no** asumir que nunca fueron pagadas.
- Propietario: retiro de dueño no es costo operativo ni comisión.
- Saldo contado distinto del esperado: diferencia identificada, sin ocultarla en ganancias.

## Lanzamiento

**Etapa A:** modelo, pruebas puras, auditoría de saldos y contabilidad en staging.
**Etapa B:** tablas y transacciones de prueba con idempotencia; medios de pago en reservas y caja.
**Etapa C:** interfaz del barbero (generado/pagado/pendiente) y flujo administrativo para confirmar retiros.
**Etapa D:** conciliación de caja y arrastre de efectivo, migración de saldos iniciales reales, piloto de jornada.
**Etapa E:** habilitar producción **solo** después de confirmar saldos históricos de apertura por barbero y contar efectivo inicial.
