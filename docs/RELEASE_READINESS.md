# SNOSERVICE — preparación de lanzamiento

Estado: **NO APTO PARA PRODUCCIÓN**. Rama local `ux/claridad-financiera-staging`.
Destino de ensayos SQL: `vjtwvhdiypfxgodhnjiw` (`snoservice-staging`). Producción `mgrggoyraetgfjwjbuts` permanece sólo lectura.

## Etapa 0 — punto de partida (2026-10-21)

- Se conservaron las modificaciones locales de la auditoría anterior, `.agents/` y `skills-lock.json`. No hubo push, merge ni despliegue.
- Auditoría previa: 6/6 unitarias, 9/9 HTTP sin escritura, 11/13 SQL en transacción y `ROLLBACK`; build correcto. Las dos fallas son cancelación vencida y finalización futura sin guard en PostgreSQL.
- Staging confirmado mediante el conector Supabase antes de cualquier DDL. El trigger de reservas existente verifica teléfono, misma franja, repetición por teléfono y ráfaga global; la exclusión GiST es la protección transaccional de solapamientos. Falta reforzar fecha, horario, servicio y snapshots en PostgreSQL.
- Plan inmediato: revisar y aplicar el guard de transiciones no destructivo a staging; repetir las 13 pruebas SQL con `ROLLBACK`; fortalecer reserva SQL y sus fixtures; verificar producción sólo por lectura; probar RPCs de lectura; cerrar seguridad, calidad y documentación.

Los resultados y bloqueos se actualizarán aquí al terminar cada etapa. Ninguna migración se aplicará a producción durante esta preparación.

## Etapa 1 — transiciones de turnos en staging

- Se aplicó `guard_appointment_transitions_staging` exclusivamente a `vjtwvhdiypfxgodhnjiw`, tras verificar proyecto, tabla, triggers existentes y SQL. Es DDL no destructivo: crea función y trigger, sin actualizar turnos.
- El guard impide cancelar al llegar la hora programada, completar antes del inicio, repetir o revertir transiciones y cambiar identidad, horario, duración o precio de un turno existente. Usa `clock_timestamp()` y `America/Montevideo`.
- `tests/staging-rollback.sql`: **13/13 escenarios aprobados** tras la migración (antes 11/13). El fixture se ejecutó en una transacción con `ROLLBACK`; comprobación posterior: **0 locales `audit-rollback-%`** y **1 trigger guard**.
- Pendiente en esta etapa: reforzar alta SQL de reservas y ejecutar prueba de concurrencia aislada. El guard todavía no existe en producción.

## Etapa 2 — alta de reservas en staging

- `validate_booking_staging` reemplazó la función del trigger existente; el primer ensayo detectó que `barbers.service_ids` es `text[]`, y `validate_booking_service_ids_text_fix_staging` corrigió el cotejo con el UUID convertido a texto. Ambas migraciones fueron sólo de staging y no tocaron filas existentes. El archivo local contiene la versión final consolidada.
- La base ahora rechaza altas con estado distinto de `confirmado`, día pasado/cerrado, horario ajeno a la grilla del local, servicio que excede el cierre, barbero/servicio de otro local o incompatible, precio/duración alterados y contacto incompleto. Bloquea filas de servicio, barbero y local durante la validación; la exclusión GiST sigue siendo la defensa contra inserciones simultáneas solapadas.
- `tests/staging-booking-rollback.sql`: **13/13 aprobados** con un local aislado y `ROLLBACK`. Comprobación posterior: **0 locales de ambos prefijos de auditoría**.
- La suite financiera/transiciones 13/13 se ejecutó justo antes de este segundo cambio. Su fixture histórico no es compatible con el nuevo control de alta de turnos pasados; debe adaptarse sin abrir un bypass en producción. Falta una prueba con dos sesiones concurrentes.

## Etapa 3 — producción sólo lectura, RPCs y exposición de PIN

- Producción `mgrggoyraetgfjwjbuts` **contiene datos**: 1 local, 2 barberos, 4 servicios y 3 reservas (las 3 canceladas); 0 cajas, cobros manuales, propinas, gastos y usuarios `auth.users` al momento de la consulta. No se escribió allí.
- Comparación de tablas principales: producción carece de 12 columnas presentes en staging (snapshots, `is_owner` y referencias de caja) y de 5 restricciones, incluida `appointments_no_active_overlap`. Su único trigger financiero/de agenda observado es el de reservas flexible `validate_booking_flexible()`. Esto **bloquea un despliegue de código** hasta migrar y verificar con copia de seguridad y ensayo equivalente.
- Los tres RPC de lectura se aplicaron a staging: `public_shop_snapshot`, `admin_bootstrap_snapshot`, `barber_bootstrap_snapshot`. `anon` no tiene EXECUTE; `SECURITY INVOKER` y filtros por local/barbero. Con ID de otro local, las colecciones son vacías. El RPC admin ya no incluye PIN; tampoco lo hacen las rutas GET ni el bootstrap de respaldo. Los cambios de PIN se reciben por POST y los PIN existentes quedan en el servidor.
- Autenticación admin ahora vincula la cookie firmada al ID de local configurado. Build, TypeScript y 6/6 unitarias pasan después de estos cambios. **Pendiente crítico:** los PIN y la contraseña administrativa aún se almacenan/comparan en claro; preparar migración y flujo de rotación antes de calificar seguridad para producción.

## Etapa 4 — integración autenticada y medición local

- `tests/integration-readonly.mjs`: **9/9** rechazos seguros por HTTP. `tests/integration-auth-readonly.mjs`: acceso admin real, acceso barbero con PIN real mantenido sólo en memoria, PIN ausente del JSON, agenda y finanzas restringidas al barbero de la cookie, consulta de propinas de otro barbero rechazada. No se imprimió ningún secreto ni se escribió una fila.
- Servidor compilado en localhost: ocho solicitudes por ruta, primera separada como fría; muestras posteriores para p50/p95. Tras aplicar RPCs en staging: admin bootstrap **240/276 ms**, barbero bootstrap **240/251 ms**, auth **2/3 ms**, catálogo público **3/4 ms** y disponibilidad pública **239/336 ms**. Referencia previa sin RPC: admin **313/639 ms**, barbero **249/398 ms** y auth **2/3 ms**. Son muestras pequeñas con latencia de red y no prueban causalidad ni comportamiento bajo carga. El catálogo público ya estaba cacheado en la referencia y no se atribuye mejora.
- El lint global inspeccionaba scripts externos de `.agents/`; se excluyeron sólo esos archivos. Queda deuda de lint del código propio por resolver o registrar expresamente.

## Etapa 5 — artefactos de lanzamiento y decisión

- Se prepararon `security/production/00..08` y las guías `PRODUCTION_DEPLOYMENT.md`, `ROLLBACK_PLAN.md`, `TEST_RESULTS.md`, `PERFORMANCE_REPORT.md` y `KNOWN_RISKS.md`. Ningún SQL de `security/production/` fue ejecutado. El orden incluye clasificación explícita de propietarios, snapshots, cierre, exclusión de solapamientos, guard de transiciones, reemplazo del trigger flexible y RPCs.
- Producción tiene 3 reservas canceladas y 0 movimientos financieros; esto reduce algunos conflictos de datos, pero **no** prueba compatibilidad. No hay rama Supabase del proyecto de producción ni `psql`/Docker local disponibles para ensayar un clon. Copia restaurable, clasificación del dueño, prueba de concurrencia y contabilidad integral siguen pendientes.
- Consulta representativa `EXPLAIN ANALYZE` en staging: 0,185 ms con 3 turnos; el tiempo observado de HTTP es principalmente ida a Supabase/servidor, no un cuello SQL demostrado. No se añadieron índices por esa muestra.
- **Decisión:** NO APTO PARA PRODUCCIÓN. Mantener rama y despliegues sin cambios hasta resolver los bloqueos de `KNOWN_RISKS.md` y obtener autorizaciones separadas para clon, cambios de producción, merge, push y publicación.
