import type { PricingRow } from './types';

export function parseEffectiveFromMs(iso: string): number | null {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * Row `provider: "openai"` matches Vercel AI SDK models that report `openai.chat`, `openai.completion`, etc.
 * Exact match still wins for rows that include the full suffix.
 */
export function pricingProviderMatches(rowProvider: string, modelReportedProvider: string): boolean {
  if (rowProvider === modelReportedProvider) return true;
  if (modelReportedProvider.startsWith(`${rowProvider}.`)) return true;
  return false;
}

/**
 * Pick the applicable row: provider match (see `pricingProviderMatches`), exact model match, latest `effectiveFrom` not after `atMs`.
 */
export function resolvePricingRow(
  rows: PricingRow[],
  args: { provider: string; model: string; atMs: number },
): PricingRow | null {
  const { provider, model, atMs } = args;
  const candidates = rows.filter((row) => {
    if (!pricingProviderMatches(row.provider, provider)) return false;
    if (row.modelPattern !== model) return false;
    const from = parseEffectiveFromMs(row.effectiveFrom);
    if (from == null) return false;
    return from <= atMs;
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const ta = parseEffectiveFromMs(a.effectiveFrom) ?? 0;
    const tb = parseEffectiveFromMs(b.effectiveFrom) ?? 0;
    return tb - ta;
  });
  return candidates[0] ?? null;
}
