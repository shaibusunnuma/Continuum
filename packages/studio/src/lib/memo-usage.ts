/** Read token/cost totals from workflow memo (`durion:usage`), same shape as the SDK list mapper. */
export function usageFromDurionMemo(memo: Record<string, unknown>): {
  totalTokens: number | null;
  costUsd: number | null;
} {
  const u = memo['durion:usage'];
  if (u === null || u === undefined || typeof u !== 'object' || Array.isArray(u)) {
    return { totalTokens: null, costUsd: null };
  }
  const o = u as Record<string, unknown>;
  const totalTokens =
    typeof o.totalTokens === 'number' && Number.isFinite(o.totalTokens) ? o.totalTokens : null;
  const costUsd = typeof o.costUsd === 'number' && Number.isFinite(o.costUsd) ? o.costUsd : null;
  return { totalTokens, costUsd };
}
