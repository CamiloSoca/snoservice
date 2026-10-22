import assert from 'node:assert/strict';
import { splitBusinessRevenue } from '../lib/financial-allocations.ts';

// Las pruebas cubren la regla más importante del negocio: los dueños aportan
// todo al fondo común; las comisiones históricas nunca se recalculan.
const owner = splitBusinessRevenue(600, {isOwner:true, commissionRate:50});
assert.deepEqual(owner,{barber:0,business:600,estimated:true});

const employee50 = splitBusinessRevenue(600,{isOwner:false,commissionRate:50});
assert.deepEqual(employee50,{barber:300,business:300,estimated:true});

const employee60 = splitBusinessRevenue(600,{isOwner:false,commissionRate:60});
assert.deepEqual(employee60,{barber:360,business:240,estimated:true});

const historical = splitBusinessRevenue(600,{isOwner:true,commissionRate:100},{
  barberEarningsSnapshot:300,
  businessEarningsSnapshot:300,
  commissionRateSnapshot:50,
});
assert.deepEqual(historical,{barber:300,business:300,estimated:false});

const cents = splitBusinessRevenue(101.01,{isOwner:false,commissionRate:33});
assert.equal(Math.round((cents.barber+cents.business)*100),10101);
assert.equal(cents.barber,33.33);
assert.equal(cents.business,67.68);

const newOwner = splitBusinessRevenue(490,{isOwner:true,commissionRate:100});
assert.equal(newOwner.business,490);
assert.equal(newOwner.barber,0);

console.log('Financial allocation tests: OK (owners, employees, snapshots, cents).');
