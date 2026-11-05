import test from 'node:test';
import assert from 'node:assert/strict';
import {getSaturdaySettlementWeek,isWithinSaturdaySettlementWeek} from '../lib/saturday-settlement-week.ts';

test('Thursday includes Sunday onward but excludes paid prior Saturday',()=>{
  assert.deepEqual(getSaturdaySettlementWeek('2026-11-05'),{start:'2026-11-01',end:'2026-11-07'});
  assert.equal(isWithinSaturdaySettlementWeek('2026-10-31','2026-11-05'),false);
  assert.equal(isWithinSaturdaySettlementWeek('2026-11-01','2026-11-05'),true);
  assert.equal(isWithinSaturdaySettlementWeek('2026-11-05','2026-11-05'),true);
  assert.equal(isWithinSaturdaySettlementWeek('2026-11-07','2026-11-05'),false);
});

test('Saturday includes full workweek; Sunday resets to a new week',()=>{
  assert.equal(isWithinSaturdaySettlementWeek('2026-11-07','2026-11-07'),true);
  assert.equal(isWithinSaturdaySettlementWeek('2026-11-01','2026-11-07'),true);
  assert.equal(isWithinSaturdaySettlementWeek('2026-11-07','2026-11-08'),false);
  assert.deepEqual(getSaturdaySettlementWeek('2026-11-08'),{start:'2026-11-08',end:'2026-11-14'});
});

test('works across calendar year and time-zone-neutral date keys',()=>{
  assert.deepEqual(getSaturdaySettlementWeek('2027-01-01'),{start:'2026-12-27',end:'2027-01-02'});
  assert.equal(isWithinSaturdaySettlementWeek('2026-12-26','2027-01-01'),false);
  assert.equal(isWithinSaturdaySettlementWeek('2026-12-27','2027-01-01'),true);
});
