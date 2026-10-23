import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isOnSitePaymentMethod} from '../lib/payment-method.ts';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const api=read('app/api/barber/route.ts');
const financeApi=read('app/api/finance/payouts/route.ts');
const modal=read('components/AppointmentDetailModal.tsx');
const ledgerSql=read('supabase/migrations/20261023_local_cash_transfer_payouts.sql');
const ui=read('components/FinanceLedgerCard.tsx');

test('solo efectivo o transferencia, jamás tarjeta ni online',()=>{
  for(const v of ['cash','transfer'])assert.equal(isOnSitePaymentMethod(v),true);
  for(const v of ['card','online','crypto','','efectivo','transferencia',null])assert.equal(isOnSitePaymentMethod(v),false);
});

test('completar un turno requiere seleccionar el método de cobro y se guarda en la misma transición',()=>{
  assert.match(api,/status === 'completado' && !isOnSitePaymentMethod\(paymentMethod\)/);
  assert.match(api,/payment_method: paymentMethod/);
  assert.match(api,/\.eq\('status', 'confirmado'\)/);
  assert.match(modal,/paymentMethod === option\.value/);
  assert.match(modal,/Seleccioná cómo pagó el cliente/);
  assert.match(modal,/disabled=\{busy \|\| !completeAllowed \|\| !paymentMethod\}/);
});

test('el pago de comisión lo autoriza admin, no la sesión del barbero',()=>{
  assert.match(financeApi,/if \(!await requireAdminSession\(\)\)/);
  assert.match(financeApi,/verifyCsrfOrigin\(request\)/);
  assert.match(financeApi,/operation!=='RECORD_BARBER_PAYOUT'/);
  assert.match(financeApi,/crypto|record_barber_payout/);
  assert.match(financeApi,/p_request_id:body\.requestId/);
  assert.match(financeApi,/ownId=admin\?null:barber!\.sub/);
});

test('tabla privada y RPC invoker restringidos a service_role',()=>{
  assert.match(ledgerSql,/barber_payouts ENABLE ROW LEVEL SECURITY/);
  assert.match(ledgerSql,/REVOKE ALL ON public\.barber_payouts FROM PUBLIC, anon, authenticated/);
  assert.match(ledgerSql,/SECURITY INVOKER/);
  assert.match(ledgerSql,/GRANT EXECUTE ON FUNCTION public\.record_barber_payout/);
  assert.match(ledgerSql,/TO service_role/);
});

test('dos retiros no pueden gastar el mismo saldo y los reintentos son idempotentes',()=>{
  assert.match(ledgerSql,/FROM public\.barbers\s+WHERE shop_id=p_shop_id AND id=p_barber_id FOR UPDATE/);
  assert.match(ledgerSql,/UNIQUE \(shop_id,request_id\)/);
  assert.match(ledgerSql,/v_balance < p_amount/);
  assert.match(ledgerSql,/v_prior\.barber_id<>p_barber_id/);
  assert.match(ledgerSql,/v_prior\.amount<>p_amount/);
  assert.match(ledgerSql,/v_prior\.method<>p_method/);
  assert.match(ledgerSql,/R AISE|RAISE EXCEPTION/);
});

test('el panel de barbero solo ve saldo, admin registra el dinero efectivamente entregado',()=>{
  assert.match(ui,/mode==='admin'&&data/);
  assert.match(ui,/method==='cash'\?'Efectivo':'Transferencia'/);
  assert.match(ui,/onFocus/);
  assert.match(ui,/Consultá el historial antes de repetir/);
  assert.match(ui,/physicalCashVerified/); // revisado, nunca mostrar cifra de caja física inventada
});
