// Shared accounting rules. Snapshot values take priority over a barbers current configuration.
// Legacy rows without snapshots are estimates; they must never be silently rewritten.
export interface FinancialSnapshot {
  barberEarningsSnapshot?: number | null;
  businessEarningsSnapshot?: number | null;
  commissionRateSnapshot?: number | null;
}

export interface FinancialWorker {
  isOwner?: boolean;
  commissionRate: number;
}

export function splitBusinessRevenue(
  gross: number,
  worker: FinancialWorker,
  snapshot?: FinancialSnapshot,
): {barber: number; business: number; estimated: boolean} {
  const totalCents = Math.round(Number(gross) * 100);
  const actualBarber = snapshot?.barberEarningsSnapshot;
  const actualBusiness = snapshot?.businessEarningsSnapshot;
  if (actualBarber != null && actualBusiness != null) {
    return {
      barber: Number(actualBarber),
      business: Number(actualBusiness),
      estimated: false,
    };
  }
  const rate = worker.isOwner ? 0 : Math.min(100, Math.max(0, Number(worker.commissionRate) || 0));
  const barberCents = Math.round(totalCents * rate / 100);
  return {
    barber: barberCents / 100,
    business: (totalCents - barberCents) / 100,
    estimated: true,
  };
}
