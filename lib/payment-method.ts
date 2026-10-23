export type OnSitePaymentMethod = 'cash' | 'transfer';

/** Los cobros se hacen en el local; no hay pagos online ni tarjetas. */
export function isOnSitePaymentMethod(value: unknown): value is OnSitePaymentMethod {
  return value === 'cash' || value === 'transfer';
}
