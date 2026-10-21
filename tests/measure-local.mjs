import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';

const base = process.env.LOCAL_BASE_URL || 'http://localhost:3015';
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(line => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
  .map(line => {
    const at = line.indexOf('=');
    return [line.slice(0, at), line.slice(at + 1).trim().replace(/^['"]|['"]$/g, '')];
  }));

async function measure(path, headers = {}, options = {}) {
  const values = [];
  let status = 0;
  let serverTiming = '';
  for (let i = 0; i < 8; i += 1) {
    const started = performance.now();
    const response = await fetch(base + path, {headers, cache: 'no-store', ...options});
    await response.arrayBuffer();
    values.push(Math.round(performance.now() - started));
    if (i === 0) {
      status = response.status;
      serverTiming = response.headers.get('server-timing') || '';
    }
  }
  const warm = values.slice(1).sort((a, b) => a - b);
  console.log(JSON.stringify({path, status, coldMs: values[0],
    warmP50Ms: warm[Math.floor((warm.length - 1) * .5)],
    warmP95Ms: warm[Math.ceil((warm.length - 1) * .95)],
    samples: values.length, serverTiming}));
}

await measure('/api/public/shop');
await measure('/api/public/booking');
await measure('/api/auth', {origin: base, 'content-type': 'application/json'}, {
  method: 'POST',
  body: JSON.stringify({username: env.ADMIN_USER, password: env.ADMIN_PASS}),
});

const login = await fetch(base + '/api/auth', {
  method: 'POST',
  headers: {origin: base, 'content-type': 'application/json'},
  body: JSON.stringify({username: env.ADMIN_USER, password: env.ADMIN_PASS}),
});
const loginResult = await login.json();
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
console.log(JSON.stringify({path: '/api/auth', status: login.status,
  ok: loginResult.ok === true, cookiePresent: cookie.startsWith('barber_admin_session=')}));
if (login.ok && loginResult.ok && cookie.startsWith('barber_admin_session=')) {
  await measure('/api/admin/bootstrap', {cookie});
}

// Sólo mide la carga de la pantalla luego de autenticar. Esta cookie de
// diagnóstico no prueba el PIN; no se imprime ni se conserva.
const publicResponse = await fetch(base + '/api/public/shop');
if (publicResponse.ok && env.SESSION_SECRET) {
  const publicShop = await publicResponse.json();
  const barberId = publicShop.barbers?.[0]?.id;
  if (barberId) {
    const data = Buffer.from(JSON.stringify({role: 'barber', sub: barberId,
      exp: Date.now() + 60_000})).toString('base64url');
    const signature = createHmac('sha256', env.SESSION_SECRET)
      .update(data).digest('base64url');
    await measure('/api/barber/bootstrap', {
      cookie: `barber_staff_session=${data}.${signature}`,
    });
  }
}
