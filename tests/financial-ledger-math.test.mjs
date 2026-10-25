import test from 'node:test';
import assert from 'node:assert/strict';
import {barberLedgerBalance,expectedCashDrawer,economicResult} from '../lib/financial-ledger-math.ts';

test('corte de $400 al 50%, retiro parcial de $100, resta pendiente $100', () => {
  assert.deepEqual(barberLedgerBalance({
    openingAdjustmentCents: 0,completedCommissionsCents:20000,manualCommissionsCents:0,
    earnedTipsCents:0,paidOutCents:10000,
  }), {earnedCents:20000,paidCents:10000,outstandingCents:10000});
  assert.equal(economicResult(40000,20000,0),20000);
});

test('pagar la comisión ya devengada no reduce el resultado económico dos veces', () => {
  assert.equal(economicResult(40000,20000,0),20000);
  assert.equal(barberLedgerBalance({
    openingAdjustmentCents:0,completedCommissionsCents:20000,manualCommissionsCents:0,
    earnedTipsCents:0,paidOutCents:20000,
  }).outstandingCents,0);
  assert.equal(economicResult(40000,20000,0),20000);
});

test('saldo esperado de caja: apertura $1000, efectivo $400, retiro $200 => $1200', () => {
  const params={openingCountedCents:100000,cashServiceReceiptsCents:40000,
    cashTipsReceivedCents:0,cashDepositsCents:0,cashOperatingExpensesCents:0,
    cashBarberPayoutsCents:20000,cashOwnerDrawsCents:0,cashRefundsCents:0};
  assert.deepEqual(expectedCashDrawer({...params,closingCountedCents:120000}),
    {expectedCents:120000,varianceCents:0});
  assert.deepEqual(expectedCashDrawer({...params,closingCountedCents:118000}),
    {expectedCents:120000,varianceCents:-2000});
});

test('transferencia bancaria no incrementa cajón físico', () => {
  const result=expectedCashDrawer({
    openingCountedCents:50000,cashServiceReceiptsCents:0,cashTipsReceivedCents:0,
    cashDepositsCents:0,cashOperatingExpensesCents:0,cashBarberPayoutsCents:0,
    cashOwnerDrawsCents:0,cashRefundsCents:0,
  });
  assert.equal(result.expectedCents,50000);
});

test('importes imposibles y operaciones con floating point se rechazan', () => {
  const b={openingAdjustmentCents:0,completedCommissionsCents:100,manualCommissionsCents:0,earnedTipsCents:0,paidOutCents:0};
  assert.throws(()=>barberLedgerBalance({...b,paidOutCents:-1}));
  assert.throws(()=>barberLedgerBalance({...b,completedCommissionsCents:0.23}));
});
