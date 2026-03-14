import path from 'path';
import { pathToFileURL } from 'url';

type CostClientLike = {
  calculateCost(provider: string, model: string, usage: { inputTokens: number; outputTokens: number }): Promise<{ totalCost?: number }>;
};

let clientInstance: CostClientLike | null = null;
let loadFailed = false;

async function getClient(): Promise<CostClientLike | null> {
  if (clientInstance) return clientInstance;
  if (loadFailed) return null;
  try {
    // token-costs is ESM-only; package name import can fail from CJS (e.g. ts-node).
    // Load via resolved path so Node uses ESM loader.
    const pkgDir = path.dirname(require.resolve('token-costs/package.json'));
    const esmPath = path.join(pkgDir, 'dist', 'npm', 'index.js');
    const mod = await import(pathToFileURL(esmPath).href);
    const CostClient = mod.CostClient ?? mod.default?.CostClient ?? mod.default;
    if (!CostClient) throw new Error('CostClient not found');
    clientInstance = new CostClient() as CostClientLike;
    return clientInstance;
  } catch (_err) {
    loadFailed = true;
    console.warn(
      '[ai-runtime] Cost SDK (token-costs) failed to load; cost will be reported as $0.',
    );
    return null;
  }
}

/**
 * Computes the cost in USD for a given token usage using the token-costs package.
 * @param provider - Provider name (e.g. "openai", "anthropic")
 * @param model - Model id (e.g. "gpt-4o-mini")
 * @param usage - Prompt and completion token counts
 * @returns Cost in USD, or 0 if pricing data is unavailable or SDK failed to load
 */
export async function calculateCostUsd(
  provider: string,
  model: string,
  usage: { promptTokens: number; completionTokens: number },
): Promise<number> {
  const client = await getClient();
  if (!client) return 0;
  try {
    const result = await client.calculateCost(provider, model, {
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
    });
    return result.totalCost ?? 0;
  } catch {
    return 0;
  }
}
