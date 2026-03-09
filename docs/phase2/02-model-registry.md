# Part 2: Model Registry

## Quick reference

| Function / type | Description |
|------------------|-------------|
| `defineModels(configs)` | Registers one or more models (id → ModelConfig). Call once at worker startup. |
| `getModelConfig(modelId)` | Returns the ModelConfig for a registered model (used internally for cost/provider). |
| `getModelInstance(modelId)` | Returns a Vercel AI SDK LanguageModel for generateText(). |
| `clearModelRegistry()` | Removes all registered models (mainly for tests). |
| `calculateCostUsd(provider, model, usage)` | Returns cost in USD for the given token usage; 0 if pricing unknown. |

## Purpose

The model registry maps developer-defined model IDs (e.g. `"fast"`, `"reasoning"`) to concrete Vercel AI SDK provider instances. The `runModel` activity (Part 4) uses it to look up the right model at execution time.

A separate cost module converts token usage reported by the AI SDK into USD using `token-costs`.

## API

### `defineModels(configs: Record<string, ModelConfig>)`

Registers one or more models in a singleton registry. Called once at worker startup.

```ts
defineModels({
  fast:      { provider: 'openai',    model: 'gpt-4o-mini' },
  reasoning: { provider: 'openai',    model: 'gpt-4o' },
  claude:    { provider: 'anthropic', model: 'claude-sonnet-4-20250514', maxTokens: 4096 },
});
```

### `getModelInstance(modelId: string): LanguageModel`

Returns a Vercel AI SDK `LanguageModel` instance ready for `generateText()`.

Internally it maps provider strings to AI SDK factory functions:

| `provider` value | AI SDK import | Call |
|---|---|---|
| `openai` | `@ai-sdk/openai` | `openai(model)` |
| `anthropic` | `@ai-sdk/anthropic` | `anthropic(model)` |

New providers are added by extending a provider map — no interface changes needed.

### `getModelConfig(modelId: string): ModelConfig`

Returns the raw config for a model (used by cost calculation to know the provider/model string).

## Cost module (`cost.ts`)

### `calculateCostUsd(provider: string, model: string, usage: { promptTokens: number; completionTokens: number }): Promise<number>`

Wraps the `token-costs` package's `CostClient.calculateCost()`.

```ts
import { CostClient } from 'token-costs';

const client = new CostClient();

const result = await client.calculateCost('openai', 'gpt-4o-mini', {
  inputTokens: usage.promptTokens,
  outputTokens: usage.completionTokens,
});

return result.totalCost;
```

Returns the cost in USD as a number. If the model isn't found in `token-costs` pricing data, returns `0` with a console warning rather than throwing.

## Provider map design

The registry uses a simple map from provider string to a factory function:

```ts
const providerFactories: Record<string, (model: string) => LanguageModel> = {
  openai: (model) => openaiProvider(model),
  anthropic: (model) => anthropicProvider(model),
};
```

Adding a new provider (e.g. Google) is:
1. `npm install @ai-sdk/google`
2. Add one line to the provider map

## Files

- `src/sdk/ai/model-registry.ts` — `defineModels`, `getModelInstance`, `getModelConfig`
- `src/sdk/ai/cost.ts` — `calculateCostUsd`
