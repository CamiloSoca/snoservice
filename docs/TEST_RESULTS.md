# Pruebas y evidencia — 2026-10-21

| Suite | Resultado | Alcance |
|---|---|---|
| `npm test` | **6/6** | Reglas de Montevideo, hora exacta de cancelación, horario comercial, solapamientos, año y reparto financiero |
| `node tests/integration-readonly.mjs` | **9/9** | HTTP localhost + staging; solicitudes inválidas rechazadas antes de escribir |
| `node tests/integration-auth-readonly.mjs` | **aprobada** | Login admin, login real de barbero con PIN en memoria, ausencia de PIN en JSON, aislamiento de turnos/propinas/cobros entre barberos |
| `tests/staging-rollback.sql` | **13/13** | Después del guard de transiciones, antes del nuevo trigger de alta; local/caja/turnos aislados, `ROLLBACK` |
| `tests/staging-booking-rollback.sql` | **13/13** | Después del nuevo trigger de alta; reserva válida, duplicado, solapamiento, día y hora inválidos, servicio incompatible, precio/duración alterados; `ROLLBACK` |
| `npx tsc --noEmit` | **aprobado** | Tipos de aplicación |
| `npm run build` | **aprobado** | Next.js 16.4; advierte convención obsoleta de `middleware` |
| `npm run lint` | **falló: 61 errores, 22 advertencias** | Sólo código propio tras excluir `.agents/`; antes 99 errores/24 advertencias incluyendo skills externas |

Los fixtures SQL se ejecutaron únicamente en `vjtwvhdiypfxgodhnjiw` y una consulta posterior confirmó 0 locales `audit-rollback-%` y `audit-booking-%`. No se cerró la caja de trabajo ni se modificaron reservas existentes. Los accesos HTTP de administrador y barbero fueron de lectura y no imprimieron secretos.

**No probados todavía:** dos sesiones SQL/HTTP insertando exactamente el mismo horario a la vez; reserva HTTP válida hasta persistencia y cancelación HTTP posterior en un local aislado; flujo real de cierre de caja por HTTP; pagos de comisión, retiros y arqueo físico (no existen como operaciones completas); migraciones sobre clon del esquema real de producción; Playwright visual. La exclusión GiST y los triggers sí se probaron en PostgreSQL con inserciones aisladas, pero eso no equivale a una carrera automatizada.

La suite histórica `staging-rollback.sql` requiere adaptación para poder insertar un turno pasado de fixture bajo el nuevo trigger de alta sin introducir un bypass en producción. Su último resultado 13/13 es anterior a ese trigger; no presentarlo como validación posterior de todo el conjunto.
