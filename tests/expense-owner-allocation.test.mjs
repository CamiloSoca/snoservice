import test from 'node:test';
import assert from 'node:assert/strict';
import {splitBusinessRevenue} from '../lib/financial-allocations.ts';

test('gastos del local no descuentan comisión de Ema', () => {
  const e = splitBusinessRevenue(500, {isOwner:false,commissionRate:50});
  assert.equal(e.barber,250);
  assert.equal(e.business,250);
  const localExpenses = 100;
  assert.equal(e.business-localExpenses,150);
  // La comisión sigue siendo $250: el gasto corresponde al negocio.
  assert.equal(e.barber,250);
});

test('el dueño aporta todo lo facturado al fondo antes de gastos', () => {
  const owner = splitBusinessRevenue(500,{isOwner:true,commissionRate:100});
  assert.equal(owner.barber,0);
  assert.equal(owner.business,500);
  assert.equal(owner.business-100,400);
});

test('la comisión guardada prevalece al cambiar porcentaje del empleado', () => {
  const result = splitBusinessRevenue(500,{isOwner:false,commissionRate:90},{
    commissionRateSnapshot:50,barberEarningsSnapshot:250,businessEarningsSnapshot:250,
  });
  assert.equal(result.barber,250);
  assert.equal(result.business,250);
  assert.equal(result.estimated,false);
});
