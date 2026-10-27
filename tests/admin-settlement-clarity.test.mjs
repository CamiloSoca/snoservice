import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const admin = readFileSync(new URL('../app/admin/page.tsx',import.meta.url),'utf8');

test('resumen combina trabajos completados por agenda y manuales clasificados',()=>{
  assert.match(admin,/const categorizedCharges = barberCharges\.filter\(c => Boolean\(c\.serviceNameSnapshot\)\)/);
  assert.match(admin,/const workCount = barberApts\.length \+ categorizedCharges\.length \+ monthlyUsesCount/);
  assert.match(admin,/const serviceCounts = new Map<string, number>\(\)/);
  assert.match(admin,/serviceCounts\.set\(type, \(serviceCounts\.get\(type\) \|\| 0\) \+ 1\)/);
  assert.match(admin,/Trabajos realizados/);
  assert.match(admin,/Facturación total/);
  assert.match(admin,/Para la barbería \(antes de gastos\)/);
  assert.match(admin,/Ver origen de los trabajos/);
  assert.doesNotMatch(admin,/>Cortes completados:<\/span>/);
  assert.doesNotMatch(admin,/>Cobros adicionales y fijos:<\/span>/);
});
test('cobros sin clasificación conservan facturación sin inventar trabajos',()=>{
  assert.match(admin,/const unclassifiedChargesCount = barberCharges\.length - categorizedCharges\.length/);
  assert.match(admin,/const barberManualChargesTotal = barberCharges\.reduce/);
  assert.match(admin,/Incluidos en facturación, no en el contador de trabajos/);
});
test('abonos cubiertos cuentan como trabajo, no ingreso adicional',()=>{
  assert.match(admin,/const monthlyUsesCount = filteredMonthlyUses\.filter/);
  assert.match(admin,/Abonos realizados/);
  assert.match(admin,/trabajos incluidos, sin cobro adicional/);
  assert.match(admin,/const grossGenerated = grossFromAppointments \+ barberManualChargesTotal/);
});
test('mantiene calculo financiero original, propinas por separado y distinción del dueño',()=>{
  assert.match(admin,/const allocated = \[\s*\.\.\.barberApts\.map\(a => splitBusinessRevenue/);
  assert.match(admin,/barberCharges\.map\(c => splitBusinessRevenue\(Number\(c\.amount\), barber, c\)\)/);
  assert.match(admin,/const barberTakeHome = allocated\.reduce\(\(sum, row\) => sum \+ row\.barber, 0\)/);
  assert.match(admin,/const leftForOwner = allocated\.reduce\(\(sum, row\) => sum \+ row\.business, 0\)/);
  assert.match(admin,/const totalBarberPocket = item\.barberTakeHome \+ item\.barberTipsTotal/);
  assert.match(admin,/const grossRevenueTotal = totalGrossAppointments \+ totalManualChargesAll/);
  assert.match(admin,/!isOwner && \(/);
});
test('filtro de fecha está antes del reporte y aplica a todas las liquidaciones',()=>{
  const report=admin.split("{activeTab === 'facturacion'")[1] || '';
  assert.ok(report.indexOf('Elegí el período') >= 0);
  assert.ok(report.indexOf('Elegí el período') < report.indexOf('Facturación Total'));
  assert.ok(report.indexOf('Facturación Total') < report.indexOf('Liquidación por barbero'));
  assert.match(admin,/isWithinPeriod\(c\.createdAt, period, selectedMonth\)/);
  assert.match(report,/Semana = últimos 7 días/);
});
