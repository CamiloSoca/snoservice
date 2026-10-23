import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const hook = file('../hooks/useAgendaAutoSync.ts');
const admin = file('../app/admin/page.tsx');
const barber = file('../components/BarberClient.tsx');
const calendar = file('../components/AgendaCalendar.tsx');
const endpoint = file('../app/api/agenda-revision/route.ts');
const barberBootstrap = file('../app/api/barber/bootstrap/route.ts');

test('ambos paneles instalan la sincronización automáticamente', () => {
  assert.match(admin, /useAgendaAutoSync\(/);
  assert.match(barber, /useAgendaAutoSync\(/);
  assert.match(admin, /onRefresh=\{refreshAgenda\}/);
  assert.match(barber, /onRefresh=\{refreshAgenda\}/);
});

test('al detectar cambios se consulta el snapshot nuevo y se recupera al volver a la app', () => {
  assert.match(hook, /getAgendaRevision\(\)/);
  assert.match(hook, /revision !== revisionLastFetched/);
  assert.match(hook, /refreshRef\.current\(\)/);
  for (const event of ['focus', 'visibilitychange', 'pageshow', 'online']) {
    assert.ok(hook.includes(event), 'falta evento: ' + event);
  }
  assert.match(hook, /FALLBACK_REFRESH_MS = 30_000/);
  assert.match(hook, /REVISION_POLL_MS = 4_500/);
});

test('la versión de agenda exige sesión y evita cache HTTP', () => {
  assert.match(endpoint, /getBarberSession/);
  assert.match(endpoint, /requireAdminSession/);
  assert.match(endpoint, /private, no-store/);
});

test('agenda móvil cómoda y vista escritorio por barbero conservadas', () => {
  assert.match(calendar, /lg:hidden/);
  assert.match(calendar, /lg:block/);
  assert.match(calendar, /aria-label="Actualizar la agenda ahora"/);
  assert.match(calendar, /view === 'semana'/);
  assert.match(calendar, /selectedBarber === 'todos'/);
  assert.match(calendar, /mode === 'barber'/);
});

test('los turnos del barbero se limitan en servidor a la sesión autenticada', () => {
  assert.match(barberBootstrap, /p_barber_id: session\.sub/);
  assert.match(barberBootstrap, /eq\('barber_id', session\.sub\)/);
  assert.match(barber, /appointment\.barberId === selectedBarberId/);
});
