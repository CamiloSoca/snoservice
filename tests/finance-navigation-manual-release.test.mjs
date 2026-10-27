import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = (name) => readFileSync(new URL('../'+name, import.meta.url), 'utf8');
const config = JSON.parse(read('vercel.json'));
const admin = read('app/admin/page.tsx');
const cash = read('components/CashDrawerCard.tsx');
const closeUI = read('components/CashCloseDialog.tsx');
const ledger = read('components/FinanceLedgerCard.tsx');
const api = read('app/api/finance/cash/route.ts');
const payoutApi = read('app/api/finance/payouts/route.ts');

test('Vercel no crea deploys automáticos de ninguna rama', () => {
  assert.equal(config.git.deploymentEnabled, false);
  assert.deepEqual(config.regions, ['gru1']);
  assert.equal(config.$schema, 'https://openapi.vercel.sh/vercel.json');
});

test('la caja tiene cuatro tareas claras y un único panel activo', () => {
  assert.match(admin, /Qué hacer con el dinero/);
  for (const label of ['Ver caja','Pagar barbero','Retirar dinero','Otros movimientos']) {
    assert.ok(admin.includes(label), label);
  }
  assert.match(admin, /cashView==='overview'&&<>/);
  assert.match(admin, /cashView==='pay'&&<FinanceLedgerCard mode="admin" display="pay"/);
  assert.match(admin, /cashView==='owner'&&<CashDrawerCard view="owner"/);
  assert.match(admin, /cashView==='movements'&&<>/);
  assert.match(admin, /aria-selected=\{cashView===item.id\}/);
  assert.match(admin, /min-h-\[90px\]/);
});

test('retiro del dueño y liquidación del equipo conservan la confirmación de pago', () => {
  assert.match(cash, /view==='owner'&&drawer\?\.cashOpen&&<form/);
  assert.match(cash, /drawer\.reliable/);
  assert.match(cash, /window\.confirm/);
  assert.match(cash, /crypto\.randomUUID\(\)/);
  assert.match(ledger, /display==='pay'&&data/);
  assert.match(ledger, /mode==='barber'\|\|display==='pay'/);
  assert.match(ledger, /requestId:attempt\.current\.requestId/);
  assert.match(ledger, /window\.confirm/);
});

test('no cambiaron rutas de servidor ni permisos por la reorganización', () => {
  assert.match(api, /requireAdminSession\(\)/);
  assert.match(api, /verifyCsrfOrigin\(request\)/);
  assert.match(api, /record_owner_draw/);
  assert.match(payoutApi, /requireAdminSession\(\)/);
  assert.match(payoutApi, /record_barber_payout/);
});

test('caja conserva cierre histórico no conciliado y cierre contado', () => {
  assert.match(closeUI, /acknowledgeLegacy:legacy/);
  assert.match(closeUI, /countedCash:normalized/);
  assert.match(admin, /operation:'OPEN_CASH', initialAmount:initialCash/);
  assert.match(admin, /summary\.physicalCashVerified/);
});
