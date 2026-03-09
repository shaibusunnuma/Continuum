# Part 2: Model Registry

## Quick reference

| Function / type | Description |
|------------------|-------------|
| `defineModels(configs)` | Registers models by id. Pass Vercel AI SDK LanguageModel instances (e.g. `openai.chat('gpt-4o-mini')`) or `{ model, maxTokens? }`. No registerProvider or costKey. |
| `getModelInstance(modelId)` | Returns the LanguageModel for generateText(). |
| `getModelOptions(modelId)` | Returns optional overrides (e.g. `maxTokens`) for the activity. |
| `clearModelRegistry()` | Removes all registered models (mainly for tests). |
| `calculateCostUsd(provider, model, usage)` | Returns cost in USD; provider/model are read from the model instance at runtime. |

## Purpose

The model registry maps developer-defined model IDs (e.g. `"fast"`, `"reasoning"`) to Vercel AI SDK LanguageModel instances. The app passes instances directly to `defineModels()`; there is no provider registration step. The `runModel` activity (Part 4) looks up the model and optional options (e.g. maxTokens) at execution time. Cost is derived from the model instance's `provider` and `modelId` (V3) when available.

## API

### `defineModels(configs): void`

Registers one or more models. Call once at worker startup. Each value is either a bare LanguageModel instance or `{ model: LanguageModel; maxTokens?: number }`.

```ts
import { openai } from '@ai-sdk/openai';
import { defineModels } from '../src/sdk';

defineModels({
  fast: openai.chat('gpt-4o-mini'),
  reasoning: openai.chat('gpt-4o'),
  custom: { model: openai.chat('gpt-4o'), maxTokens: 4096 },
});
```

No `registerProvider` or `costKey`. Install only the provider packages you use (e.g. `@ai-sdk/openai`). Cost is computed at runtime from the instance's `provider` and `modelId` when present.

### `getModelInstance(modelId: string): LanguageModel`

Returns the Vercel AI SDK LanguageModel for the given id, ready for `generateText()`.

### `getModelOptions(modelId: string): ModelOptions`

Returns optional overrides for the model (e.g. `{ maxTokens?: number }`). Used internally by the runModel activity.

### Cost

The activity calls `calculateCostUsd(provider, modelId, usage)` with `provider` and `modelId` read from the LanguageModel instance (when the instance has those properties, e.g. V3). If not present, cost is reported as 0.

## Cost module (`cost.ts`)

### `calculateCostUsd(provider: string, model: string, usage: { promptTokens: number; completionTokens: number }): Promise<number>`

Wraps the `token-costs` package. Returns cost in USD; 0 with a console warning if pricing data is unavailable.

## Files

- `src/sdk/ai/model-registry.ts` — `defineModels`, `getModelInstance`, `getModelOptions`, `clearModelRegistry`
- `src/sdk/ai/cost.ts` — `calculateCostUsd`
