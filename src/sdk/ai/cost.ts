let clientInstance: any = null;

async function getClient(): Promise<any> {
  if (clientInstance) return clientInstance;
  const { CostClient } = await import('token-costs');
  clientInstance = new CostClient();
  return clientInstance;
}

/**
 * Computes the cost in USD for a given token usage using the token-costs package.
 * @param provider - Provider name (e.g. "openai", "anthropic")
 * @param model - Model id (e.g. "gpt-4o-mini")
 * @param usage - Prompt and completion token counts
 * @returns Cost in USD, or 0 if pricing data is unavailable (logs a warning)
 */
export async function calculateCostUsd(
  provider: string,
  model: string,
  usage: { promptTokens: number; completionTokens: number },
): Promise<number> {
  try {
    const client = await getClient();
    const result = await client.calculateCost(provider, model, {
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
    });
    return result.totalCost;
  } catch {
    console.warn(
      `[ai-runtime] Cost data unavailable for ${provider}/${model}, reporting $0`,
    );
    return 0;
  }
}
