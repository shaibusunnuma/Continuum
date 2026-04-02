/** One effective-dated price line for `createTableCostCalculator`. */
export interface PricingRow {
  provider: string;
  /** v1: exact match on `CostCalculatorPayload.model`. */
  modelPattern: string;
  /** ISO-8601 instant; this row applies when `effectiveFrom <= requestedAtMs`. */
  effectiveFrom: string;
  inputUsdPer1M: number;
  outputUsdPer1M: number;
}
