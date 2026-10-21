# SNOSERVICE — traspaso de Codex (2026-10-21)

## Estado y límites

- Repositorio local: `C:\Users\Samaakid\barberagenda-staging-actualizada`; rama `ux/claridad-financiera-staging` (seguimiento `origin/ux/claridad-financiera-staging`). No se hizo push, merge ni despliegue.
- Resultado: **NO APTO PARA PRODUCCIÓN**. Hay protección de reservas aplicada y probada en staging, pero faltan un ensayo integral de migración en clon, el libro financiero completo, seguridad de PIN, pruebas de concurrencia y E2E.
- Supabase staging: `vjtwvhdiypfxgodhnjiw`; producción: `mgrggoyraetgfjwjbuts`. No se escribió en producción. No continuar con escrituras de base de datos sin volver a comprobar proyecto, SQL y seguridad de los datos.
- El estado de Git previo al commit incluía las modificaciones de aplicación, SQL, tests y documentos enumerados abajo, además de `.agents/` y `skills-lock.json` sin seguimiento. Estos últimos son privados y deben permanecer fuera del commit; `.env.local` tampoco se debe incluir.

## Trabajo implementado

- Reservas: reglas de fecha y horarios en `lib/appointment-rules.ts`; API con validación del horario comercial en `America/Montevideo`, compatibilidad servicio/barbero, precio y duración del catálogo, teléfono/correo y rechazo de solapamientos. Las rutas de cancelación y finalización exigen estado confirmado y comparan contra el reloj del servidor; una cancelación a la hora exacta de inicio se rechaza. La exclusión GiST de la base protege carreras de reservas.
- Finanzas: snapshots al completar; comisión del dueño cero y aporte completo al negocio, comisión de empleado según porcentaje; identificador de solicitud UUID para evitar reintentos duplicados en cobros manuales y propinas. Se exige caja abierta donde corresponde. **No existe aún un libro mayor completo** para pagos de comisiones, retiros, efectivo contado y diferencias de caja.
- Seguridad: sesión administrativa vinculada al local configurado; eliminado PIN de los JSON de administración; en administración un PIN en blanco conserva el actual y el cambio exige PIN nuevo fuerte. `lib/crypto-server.ts` ya no usa la clave de servicio como secreto de sesión de reserva; requiere `SESSION_SECRET` largo. La configuración del servidor exige ID de local y no cae a producción por defecto.
- Rendimiento: RPC de lectura para bootstrap público, administrador y barbero, ejecución en paralelo de consultas donde fue posible y circuit breaker de 60 s ante ausencia de RPC. No se cachean ganancias confirmadas como si fueran actuales. Cambios de interfaz en `app/admin/page.tsx`, `components/BarberClient.tsx` y `components/BookingClient.tsx` para claridad de estados y dueño/empleado.
- Calidad: `eslint.config.mjs` excluye únicamente las skills externas `.agents/**`; no desactiva reglas globales del código propio.

## SQL aplicado EXCLUSIVAMENTE en staging

Se aplicaron estas migraciones mediante Supabase MCP, en este orden. Los archivos locales de staging son su versión final consolidada cuando se indica:

1. `guard_appointment_transitions_staging`, desde `security/staging-appointment-transition-guard-PENDING-REVIEW.sql`: función y trigger de transición. Bloquea cancelación vencida o repetida, finalización futura o repetida, transición desde cancelado y mutación de campos esenciales.
2. `validate_booking_staging`, versión inicial de `security/staging-booking-validation.sql`: reemplazó el trigger de validación de reserva; la prueba reveló que `barbers.service_ids` es `text[]`.
3. `validate_booking_service_ids_text_fix_staging`, corrección posterior del mismo archivo (versión actual): castea el UUID del servicio a texto. Valida reserva futura dentro de 30 días, agenda abierta, grilla de turnos, local/servicio/barbero compatibles, precio y duración reales, datos del cliente y teléfono/día. Se conserva la exclusión GiST existente.
4. `public_shop_snapshot_staging`, desde `security/public-shop-one-rpc.sql`.
5. `admin_bootstrap_snapshot_staging`, desde `security/admin-bootstrap-one-rpc.sql` (respuesta sin PIN).
6. `barber_bootstrap_snapshot_staging`, desde `security/barber-bootstrap-one-rpc.sql`.

No se ejecutó SQL en producción. Los fixtures `audit-rollback-%` y `audit-booking-%` quedaron en **cero filas** después de `ROLLBACK`. `security/booking-flexible-production-apply.sql` **no debe ejecutarse**: permite solapamientos contrarios a los requisitos.

## SQL pendiente y orden de lanzamiento propuesto

Los scripts en `security/production/` son **borradores no ejecutados ni ensayados en clon**. El orden preparado es `00_preflight_readonly.sql`, `01_owner_mapping.sql` (requiere confirmar `OWNER_BARBER_IDS` con el negocio), `02_finance_snapshots.sql`, `03_cash_close.sql`, `04_unique_cash_and_overlap.sql`, `05_transition_guard.sql`, `06_booking_validation.sql`, `07a_public_rpc.sql`, `07b_admin_rpc.sql`, `07c_barber_rpc.sql`, `08_verify_readonly.sql`. No afirmar que son seguros o compatibles hasta correrlos en clon con copia de seguridad y datos equivalentes. Ver `docs/PRODUCTION_DEPLOYMENT.md` y `docs/ROLLBACK_PLAN.md`. La aplicación nueva no debe desplegarse antes de compatibilizar el esquema.

## Pruebas y mediciones verificadas

- `npm test`: **6/6** unitarias aprobadas.
- `node tests/integration-readonly.mjs`: **9/9** respuestas HTTP seguras aprobadas.
- `node tests/integration-auth-readonly.mjs`: aprobado contra localhost/staging tras corregir una aserción de forma; administrador/barbero, aislamiento por barbero, ausencia de PIN en JSON. Un primer intento tuvo `EACCES` de red del sandbox y se volvió a ejecutar con autorización.
- `tests/staging-rollback.sql`: **13/13** transaccionales aprobadas tras el guard y **antes** de instalar la validación de INSERT. Su fixture histórico ahora puede ser rechazado por el nuevo trigger; no afirmar que esta suite volvió a pasar después.
- `tests/staging-booking-rollback.sql`: **13/13** aprobadas tras el trigger corregido, dentro de transacción revertida.
- `npx tsc --noEmit`: aprobado. `npm run build`: **aprobado nuevamente después del commit `57af599`**, con Next.js 16.4 y el ajuste de `lib/crypto-server.ts`; advirtió sobre la convención obsoleta `middleware`.
- `npm run lint`: **falló** con 61 errores y 22 advertencias del código propio después de excluir `.agents/**` (antes había 99/24). Pendiente corregirlos sin desactivar reglas importantes.
- `git diff --check`: aprobado antes de este documento.
- No se ejecutó flujo HTTP válido con escritura, prueba de dos conexiones concurrentes, Playwright, cierre de caja aislado, ensayo de migración en clon ni carga agresiva.

Medición local de servidor compilado y Supabase staging remoto, 8 muestras secuenciales por ruta (primera fría; 7 posteriores), sin carga:

| Ruta | Antes p50/p95 | Después p50/p95 | Frío posterior |
| --- | ---: | ---: | ---: |
| Bootstrap administrador | 313/639 ms | 240/276 ms | 299 ms |
| Bootstrap barbero | 249/398 ms | 240/251 ms | 237 ms |
| Autenticación | 2/3 ms | 2/3 ms | — |
| Tienda pública (después) | — | 3/4 ms | 47 ms |
| Reservas públicas (después) | — | 239/336 ms | 215 ms |

Hay una referencia anterior a otros cambios de 495/756 ms (admin) y 514/790 ms (barbero), pero no confundirla con la comparación inmediata de RPC. `EXPLAIN ANALYZE` de citas activas en staging (3 filas) tardó 0,185 ms, `Seq Scan`, sin lectura de disco; no justifica índice nuevo. Ver método completo en `docs/PERFORMANCE_REPORT.md`. Muestra pequeña: no extrapolar p95 a producción.

## Producción observada SOLO con lecturas

- Supabase producción tiene 1 local, 2 barberos, 4 servicios, 3 reservas (todas canceladas), 0 cajas, cobros manuales, propinas, gastos y `auth.users` observados. **No asumir que está vacía**.
- Frente a staging faltan 12 columnas (incluidas snapshots, `is_owner` y referencias de caja) y 5 constraints, incluida exclusión GiST de citas activas. Hay un trigger antiguo de reservas flexibles en INSERT OR UPDATE, faltan funciones de caja/finanzas y las 3 RPC existentes tienen definiciones antiguas. RLS estaba habilitado y con 3 políticas comparables en las tablas revisadas; `btree_gist` ya está instalado.
- El rol de un barbero indica `Master Barber` con 100% y otro `Barber & Colorist` con 50%, pero **eso no demuestra quién es propietario**. Confirmación del negocio obligatoria antes de `01_owner_mapping.sql`.
- Vercel (lectura solamente): proyecto de aplicación `13-cut`, dominio `13-cut.snoservice.uy`; `snoservice-web` es el sitio corporativo. El metadata de entorno productivo de `13-cut` **no muestra `NEXT_PUBLIC_SHOP_ID` ni `SHOP_ID`**. Las variables de URL y claves tienen valores redactados/vacíos aun solicitando lectura, por lo que **no se pudo verificar** que apunten a producción. No se cambió Vercel.

## Bloqueos y riesgos restantes

1. **Integridad financiera incompleta**: comisiones pagadas, retiros de dueños, efectivo esperado/contado y ajustes compensatorios no tienen libro auditable. `final_amount` es resultado económico, no saldo acumulado ni efectivo físico. No mostrarlo como dinero disponible.
2. PIN de barberos en texto claro en la base; autenticación administrativa basada en contraseña de entorno y limitación de tasa no distribuida. Requiere diseño y migración de seguridad probada.
3. Ausencia de ensayo de migración de producción en clon, copia/recuperación comprobada y prueba E2E de escritura/concurrencia. Producción carece de exclusión de solapamientos. Los scripts de producción pueden necesitar correcciones.
4. Falta confirmar dueño y configurar ID del local en Vercel producción. Valores secretos de Vercel no verificables desde esta inspección; revisión segura posterior obligatoria.
5. Lint fuente fallido. La compilación final sí pasó; el aviso de `middleware` queda pendiente.
6. No hay prueba integral de cierres concurrentes ni registro de movimientos con caja cerrada en un entorno aislado equivalente. Consultar `docs/KNOWN_RISKS.md` para más detalle.

## Archivos para revisar al retomar

- Código: `app/admin/page.tsx`, `app/api/{admin,auth,barber,finance,public}/`, `components/{BarberClient,BookingClient}.tsx`, `lib/{appointment-rules,booking-store,crypto-server,session,supabase-server}.ts`, `package.json`, `eslint.config.mjs`.
- SQL staging: `security/staging-appointment-transition-guard-PENDING-REVIEW.sql`, `security/staging-booking-validation.sql`, `security/{public-shop-one-rpc,admin-bootstrap-one-rpc,barber-bootstrap-one-rpc}.sql`.
- SQL producción: `security/production/*.sql` (borradores); tests: `tests/appointment-rules.test.mjs`, `tests/integration-*-readonly.mjs`, `tests/staging-*-rollback.sql`, `tests/measure-local.mjs`.
- Informes: `docs/{RELEASE_READINESS,PRODUCTION_DEPLOYMENT,ROLLBACK_PLAN,TEST_RESULTS,PERFORMANCE_REPORT,KNOWN_RISKS}.md`.

## Primera tarea de la próxima sesión

Confirmar `git status` y los commits locales, leer este handoff y `docs/RELEASE_READINESS.md`; resolver `npm run lint`. Después atacar el bloqueo más grave con **un entorno aislado**: ensayo de los SQL de producción en clon/backup verificado y prueba de reservas concurrentes. Antes de cualquier escritura confirmar el proyecto destino y la reversibilidad; jamás aplicar los borradores a producción ni hacer push/despliegue sin autorización. No repetir las pruebas de staging ya documentadas salvo que cambie el código o SQL relevante.
