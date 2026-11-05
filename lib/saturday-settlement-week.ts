/**
 * 13Cut settles barber earnings on Saturdays. The accounting week starts on
 * Sunday and ends on Saturday, always using Montevideo YYYY-MM-DD date keys.
 * Inputs are normalized date keys; never parse local browser time zones here.
 */
export function getSaturdaySettlementWeek(todayKey: string): {start: string; end: string} {
  const nowMs=Date.parse(todayKey+'T00:00:00Z');
  if (!Number.isFinite(nowMs)) throw new Error('Fecha de liquidación inválida');
  const daysSinceSunday=new Date(nowMs).getUTCDay();
  const sundayMs=nowMs-daysSinceSunday*86_400_000;
  return {
    start:new Date(sundayMs).toISOString().slice(0,10),
    end:new Date(sundayMs+6*86_400_000).toISOString().slice(0,10),
  };
}

export function isWithinSaturdaySettlementWeek(dateKey: string, todayKey: string): boolean {
  const dateMs=Date.parse(dateKey+'T00:00:00Z');
  const todayMs=Date.parse(todayKey+'T00:00:00Z');
  if (!Number.isFinite(dateMs) || !Number.isFinite(todayMs)) return false;
  const daysSinceSunday=new Date(todayMs).getUTCDay();
  const sundayMs=todayMs-daysSinceSunday*86_400_000;
  // Only completed work through today, not incorrectly future-dated movements.
  return dateMs>=sundayMs && dateMs<=todayMs;
}
