# Procedimiento futuro de despliegue — NO EJECUTAR TODAVÍA

**Bloqueado:** `docs/KNOWN_RISKS.md` describe contabilidad, PIN, pruebas de concurrencia, lint y ensayo de migraciones pendientes. Este documento fija el orden para cuando esos bloqueos estén resueltos y exista autorización separada para escribir en producción, integrar `main`, hacer push y desplegar. Ningún paso de escritura se ejecutó durante la preparación.

## 0. Ventana, copia y ensayo

1. Congelar nuevos turnos y movimientos durante la ventana acordada; anotar conteos antes de cualquier DDL. Confirmar que el destino es **`mgrggoyraetgfjwjbuts`**, no `vjtwvhdiypfxgodhnjiw`. No guardar cadenas de conexión ni secretos en Git, logs o capturas.
2. Ejecutar `security/production/00_preflight_readonly.sql` con `psql -v ON_ERROR_STOP=1 -f ...` contra la URL de conexión de **producción** almacenada fuera del repositorio. Debe mostrar 0 solapamientos activos, ausencia de datos malformados, una sola clasificación posible de propietarios y conteos coherentes. Hoy existen 3 reservas canceladas, 2 barberos y 0 cajas; repetir porque el estado puede cambiar.
3. Crear y comprobar una copia restaurable. Preferir **Restore to a New Project** desde Backups de Supabase y ejecutar el preflight sobre el clon. Esa función requiere plan y backups compatibles; el clon reproduce base, pero necesita revisión separada de Storage, Auth, claves y configuración. Ver [documentación de restauración a proyecto nuevo](https://supabase.com/docs/guides/platform/clone-project) y [backups](https://supabase.com/docs/guides/platform/backups). Si no está disponible, obtener dumps de roles/esquema/datos con `supabase db dump` y restaurar en entorno aislado; verificar conteos y acceso antes de usarlo como plan de recuperación. Ver [guía oficial de dump/restauración](https://supabase.com/docs/guides/self-hosting/restore-from-platform). No ensayar sobre producción.
4. Confirmar con el negocio los UUID de todos los barberos propietarios. La comisión del 100% **no** demuestra titularidad. Ejecutar en el clon la secuencia 01–08 indicada abajo; repetir las suites de datos, perfiles, permisos y tiempos de DDL. Si el clon falla, no continuar.

## 1. Migraciones SQL en el clon y, sólo después de aprobación, en producción

Usar `psql` con `ON_ERROR_STOP=1`, conexión protegida verificada antes de cada archivo y sin `--single-transaction` global porque cada archivo gestiona su propia transacción. **Nunca ejecutar** `security/booking-flexible-production-apply.sql`.

| Orden | Archivo | Comprobación antes de seguir |
|---|---|---|
| 00 | `security/production/00_preflight_readonly.sql` | Conteos, RLS, propietarios y solapamientos revisados |
| 01 | `security/production/01_owner_mapping.sql` | Pasar `-v OWNER_BARBER_IDS='uuid[,uuid...]'` confirmado; ningún propietario desconocido ni valor nulo |
| 02 | `security/production/02_finance_snapshots.sql` | 12 columnas/snapshots y triggers; históricos sin backfill estimado |
| 03 | `security/production/03_cash_close.sql` | Función de cierre atómica, referencias de caja y guardas; probar sólo en fixture aislado |
| 04 | `security/production/04_unique_cash_and_overlap.sql` | Índice de una caja abierta y exclusión GiST; falla sin alterar datos si hay conflictos |
| 05 | `security/production/05_transition_guard.sql` | Cancelación vencida y finalización futura rechazadas por SQL |
| 06 | `security/production/06_booking_validation.sql` | Sustituye atómicamente el trigger flexible por validación estricta de INSERT |
| 07a–c | `security/production/07a_public_rpc.sql`, `07b_admin_rpc.sql`, `07c_barber_rpc.sql` | `anon` sin EXECUTE; admin no devuelve PIN; filtros por local/barbero |
| 08 | `security/production/08_verify_readonly.sql` | Restricciones, triggers, permisos y conteos correctos |

Los archivos 01–08 **no fueron ensayados sobre un clon de producción**. El orden es preparado, no una aprobación para ejecutarlo. Cada migración debe registrar hora, resultado y conteos; ante un fallo, detener la secuencia y seguir `docs/ROLLBACK_PLAN.md`.

## 2. Variables y código, sólo después de verificar el esquema

1. Revisar en Vercel las variables **Production** sin copiarlas al repositorio: `NEXT_PUBLIC_SUPABASE_URL` debe ser `https://mgrggoyraetgfjwjbuts.supabase.co`; `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` deben pertenecer al mismo proyecto; `NEXT_PUBLIC_SHOP_ID`/`SHOP_ID` debe ser el local de producción confirmado por lectura; `SESSION_SECRET` debe ser exclusivo y de al menos 32 caracteres; `ADMIN_USER` y `ADMIN_PASS`/`ADMIN_PASSWORD` deben ser secretos propios de producción. Verificar `NEXT_PUBLIC_SHOP_PREFIX`, nombre/ciudad y SMTP si se enviarán correos. Nunca exponer la clave service role como `NEXT_PUBLIC_*`.
2. Confirmar que la rama staging pasa build, tipos, lint, tests SQL/HTTP, concurrencia y pruebas de humo en el clon. Guardar el commit exacto y un punto de reversión de código. **No desplegar antes de 08.**
3. Con autorización separada, revisar diff y PR de `ux/claridad-financiera-staging` hacia `main`; integrar sin arrastrar `.env.local`, fixtures ni datos. Hacer push sólo tras aprobación. Desplegar manualmente la revisión exacta en Vercel Production y verificar que Netlify staging no apunta a producción por accidente.
4. Smoke test sin modificar datos ajenos: catálogo, login admin/barbero, aislamiento de perfiles, resumen económico, disponibilidad; con fixture previamente autorizado comprobar reserva, conflicto de horario, cancelación antes/después del inicio, corte/cobro/propina/gasto/cierre. Confirmar que las respuestas privadas llevan `no-store`, no hay errores 5xx y la nueva versión usa el esquema esperado. Registrar resultados y habilitar tráfico.

No confundir resultado económico del período con efectivo físico ni saldo acumulado. Esas funciones siguen bloqueadas hasta completar un libro auditable.
