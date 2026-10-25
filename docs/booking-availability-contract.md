# Contrato de disponibilidad 13'Cut — reservas normales y agenda fija

**Estado:** corrección candidata, sin despliegue a producción. No modificar el contrato sin aprobar otra matriz de pruebas.

## Principio

- El sistema reserva un profesional concreto en una fecha concreta.
- `normal → normal`: **mantener** `bookingIntervalsConflict` sin cambios.
  - Dos cortes menores de 90 minutos pueden compartir **hasta 30 minutos**, únicamente si el candidato comienza **antes** del turno existente.
  - Si el candidato comienza en medio del existente, siempre se bloquea.
  - Coincidencia de inicio: siempre se bloquea.
  - Si cualquiera de los servicios dura 90 minutos o más: cualquier solapamiento se bloquea.
- `normal → fijo`: **bloquear absolutamente cualquier solapamiento**, usando `slotsOverlap`.
- `fijo → normal` y `fijo → fijo`: la base de datos ya valida intervalos estrictamente.
- Toda coincidencia se compara solo para **el mismo barbero y la misma fecha**.
- Intervalos contiguos como 09:00–10:00 y 10:00–11:00 no se solapan.
- Un fijo pausado o vencido no bloquea. Ningún dato personal del fijo sale en la disponibilidad pública.

## Matriz de referencia: turno existente de 10:00 a 11:00

| Nuevo turno de 60 minutos | Existente normal | Existente fijo | Motivo |
|---|---|---|---|
| 09:00–10:00 | Permitido | Permitido | Termina al comienzo |
| 09:30–10:30 | Permitido | **Bloqueado** | Normal admite 30 min; fijo no |
| 10:00–11:00 | **Bloqueado** | **Bloqueado** | Mismo inicio |
| 10:30–11:30 | **Bloqueado** | **Bloqueado** | Inicio dentro del existente |
| 11:00–12:00 | Permitido | Permitido | Empieza al finalizar |

### Recorrido de datos de la corrección

`fixed_bookings` (nombre y teléfono **privados**) → GET `/api/public/booking` (fecha, barbero, hora, duración y **isFixed: true**, sin datos privados) → `getPublicBookedSlots` (conserva la marca) → `isSlotAvailable` (bloqueo estricto **solo** si `isFixed === true`) → UI de horarios.

En `POST /api/public/booking`, las reservas normales se siguen comparando mediante la regla histórica. El `INSERT` queda protegido por el trigger PostgreSQL `guard_weekly_bookings`, que no cambia en esta rama.

### Límites que no deben modificarse

1. No cambiar `bookingIntervalsConflict`, ni usar `slotsOverlap` indiscriminadamente.
2. No alterar triggers, migraciones, bloqueos transaccionales, horarios ni precios.
3. No añadir nombres, teléfonos o emails al endpoint público.
4. No publicar ni fusionar sin pruebas de compatibilidad.
5. No afirmar que los tests del código simulan por completo solicitudes simultáneas: esas pruebas requieren una prueba de concurrencia aislada.

## Verificación y plan de publicación

- Tests automáticos: matriz normal/fijo y paridad exhaustiva con la regla anterior; fechas/barberos, servicio largo, 0–30 minutos de cruce y privacidad pública.
- Verificar TypeScript, lint y build en GitHub.
- Revisión manual de diff: solo reglas de presentación y marcación de fijos; **sin** SQL de escritura, **sin** migraciones nuevas.
- Sin cambios en `main` ni despliegue automático. Revisión humana del PR y despliegue manual supervisado.
- Probar página pública tras despliegue con un fijo existente, sin cargar datos de prueba en producción. Si aún no existen fijos, usar entorno de prueba.
- Rollback: redeploy del commit previo en Vercel (sin reversión de base de datos).
