import type { CostAttribution, CostCalculationResult } from '../types';

/**
 * Normalize `CostCalculator.calculate` return value to cost + optional attribution.
 */
export async function normalizeCostCalculationResult(
  raw: CostCalculationResult | Promise<CostCalculationResult>,
): Promise<{ costUsd: number; attribution?: CostAttribution }> {
  const r = await raw;
  if (typeof r === 'number') {
    if (!Number.isFinite(r)) return { costUsd: 0 };
    return { costUsd: r };
  }
  const costUsd = Number.isFinite(r.costUsd) ? r.costUsd : 0;
  return { costUsd, attribution: r.attribution };
}
