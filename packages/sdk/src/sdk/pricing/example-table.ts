/**
 * Non-authoritative sample rows for local dev / copy-paste. Do not treat as live vendor prices.
 * Use `provider: "openai"` — it matches `@ai-sdk/openai` models that report `openai.chat` (see `pricingProviderMatches`).
 */
import type { PricingRow } from './types';

export const EXAMPLE_PRICING_ROWS: PricingRow[] = [
  {
    provider: 'openai',
    modelPattern: 'gpt-4o-mini',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    inputUsdPer1M: 0.15,
    outputUsdPer1M: 0.6,
  },
  {
    provider: 'google',
    modelPattern: 'gemini-2.5-flash',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    inputUsdPer1M: 0.25,
    outputUsdPer1M: 0.69,
  },
];
