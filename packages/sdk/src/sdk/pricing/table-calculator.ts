import type { CostAttribution, CostCalculator } from '../types';
import type { PricingRow } from './types';
import { resolvePricingRow } from './resolve';

/**
 * Factory: versioned USD pricing from effective-dated rows. Rates live in data, not hard-coded in app logic.
 */
export function createTableCostCalculator(tableId: string, rows: PricingRow[]): CostCalculator {
  return {
    calculate: (payload) => {
      const row = resolvePricingRow(rows, {
        provider: payload.provider,
        model: payload.model,
        atMs: payload.requestedAtMs,
      });
      if (!row) {
        const attribution: CostAttribution = {
          kind: 'unknown',
          pricingTableId: tableId,
          inputUsdPer1M: 0,
          outputUsdPer1M: 0,
          matchedKey: payload.model,
        };
        return { costUsd: 0, attribution };
      }
      const costUsd =
        (payload.inputTokens / 1e6) * row.inputUsdPer1M + (payload.outputTokens / 1e6) * row.outputUsdPer1M;
      const attribution: CostAttribution = {
        kind: 'table',
        pricingTableId: tableId,
        pricingEffectiveAt: row.effectiveFrom,
        inputUsdPer1M: row.inputUsdPer1M,
        outputUsdPer1M: row.outputUsdPer1M,
        matchedKey: payload.model,
      };
      return { costUsd, attribution };
    },
  };
}
