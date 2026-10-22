# Rendimiento medido — 2026-10-21

Servidor local `next start -p 3015`, build de producción, Supabase staging remoto. `tests/measure-local.mjs` hizo 8 solicitudes secuenciales por ruta; la primera se informa como fría y las 7 restantes se ordenan para p50/p95. Son muestras exploratorias, sin carga concurrente ni control de latencia de red. No describen la experiencia de producción ni sustituyen métricas de navegador.

| Ruta | Referencia anterior sin RPC p50/p95 | Después de RPC p50/p95 | Fría posterior | Estado |
|---|---:|---:|---:|---|
| `/api/admin/bootstrap` | 313/639 ms | 240/276 ms | 299 ms | RPC confirmado por `Server-Timing` |
| `/api/barber/bootstrap` | 249/398 ms | 240/251 ms | 237 ms | RPC confirmado por `Server-Timing` |
| `/api/auth` | 2/3 ms | 2/3 ms | 7 ms | Sin cambio atribuible al RPC |
| `/api/public/shop` | caché caliente ~3–5 ms | 3/4 ms | 47 ms | Sin mejora demostrada |
| `/api/public/booking` | ~200–300 ms | 239/336 ms | 215 ms | Sin mejora demostrada |

La referencia más antigua, antes de retirar una consulta de autenticación fallida y de reducir intentos de RPC ausentes, fue auth 229/404 ms, admin 495/756 ms y barbero 514/790 ms. No comparar esas cifras como experimento controlado de los RPC. El cliente Supabase del servidor se reutiliza por proceso; datos financieros no se cachean y las rutas privadas envían `Cache-Control: private, no-store`.

`EXPLAIN (ANALYZE, BUFFERS)` de lectura de turnos activos por local en staging: 3 filas examinadas, 1 devuelta, ejecución **0,185 ms**, 0 bloques leídos de disco; PostgreSQL eligió `Seq Scan`. Con tan pocos datos no hay evidencia de cuello de botella SQL ni base para agregar índices por intuición. La mayor parte del tiempo HTTP corresponde a viajes de red/servidor. Faltan trazas de navegador y mediciones con volumen representativo antes de fijar un SLO p95 de producción. No se hizo carga agresiva.

Scripts reproducibles: `node tests/measure-local.mjs` con build y servidor local; las credenciales se leen de `.env.local` y jamás se imprimen.
