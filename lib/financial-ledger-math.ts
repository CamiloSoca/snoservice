/**
 * Modelo monetario preliminar para conciliación. No escribe caja ni transfiere dinero.
 * Todos los importes se expresan en centésimos para evitar errores binarios.
 * La función exige que un desembolso sea efectivamente confirmado, no solicitado.
 */
export interface BarberLedgerInputs {
  openingAdjustmentCents: number;
  completedCommissionsCents: number;
  manualCommissionsCents: number;
  earnedTipsCents: number;
  paidOutCents: number;
}
export interface CashDrawerInputs {
  openingCountedCents: number;
  cashServiceReceiptsCents: number;
  cashTipsReceivedCents: number;
  cashDepositsCents: number;
  cashOperatingExpensesCents: number;
  cashBarberPayoutsCents: number;
  cashOwnerDrawsCents: number;
  cashRefundsCents: number;
  closingCountedCents?: number;
}
function cents(n: number): number {
  if (!Number.isSafeInteger(n)) throw new Error('Los importes deben ser centésimos enteros seguros.');
  return n;
}
function nonNegative(n: number): number {
  n = cents(n);
  if (n < 0) throw new Error('El importe no puede ser negativo.');
  return n;
}
export function barberLedgerBalance(input: BarberLedgerInputs) {
  const opening = cents(input.openingAdjustmentCents); // Ajuste de apertura firmado y auditado.
  const earned = nonNegative(input.completedCommissionsCents)
    + nonNegative(input.manualCommissionsCents) + nonNegative(input.earnedTipsCents);
  const paid = nonNegative(input.paidOutCents);
  const available = opening + earned - paid;
  if (!Number.isSafeInteger(available)) throw new Error('El saldo excede el rango contable.');
  return {earnedCents: earned, paidCents: paid, outstandingCents: available};
}
export function expectedCashDrawer(input: CashDrawerInputs) {
  const plus = nonNegative(input.openingCountedCents)
    + nonNegative(input.cashServiceReceiptsCents)
    + nonNegative(input.cashTipsReceivedCents)
    + nonNegative(input.cashDepositsCents);
  const minus = nonNegative(input.cashOperatingExpensesCents)
    + nonNegative(input.cashBarberPayoutsCents)
    + nonNegative(input.cashOwnerDrawsCents)
    + nonNegative(input.cashRefundsCents);
  const expectedCents = plus - minus;
  if (!Number.isSafeInteger(expectedCents)) throw new Error('El saldo excede el rango contable.');
  const closingCounted = input.closingCountedCents;
  return {
    expectedCents,
    varianceCents: closingCounted === undefined ? null : nonNegative(closingCounted) - expectedCents,
  };
}
export function economicResult(grossCents: number, barberCommissionsCents: number, operatingExpensesCents: number) {
  return nonNegative(grossCents) - nonNegative(barberCommissionsCents)
    - nonNegative(operatingExpensesCents);
}
