import type { LanguageModel } from 'ai';
import { openai as openaiProvider } from '@ai-sdk/openai';
import { anthropic as anthropicProvider } from '@ai-sdk/anthropic';
import type { ModelConfig } from '../types';

// ---------------------------------------------------------------------------
// Provider factory map — extend this to add new providers
// ---------------------------------------------------------------------------

const providerFactories: Record<string, (model: string) => LanguageModel> = {
  openai: (model) => openaiProvider.chat(model),
  anthropic: (model) => anthropicProvider(model),
};

// ---------------------------------------------------------------------------
// Singleton registry
// ---------------------------------------------------------------------------

const registry = new Map<string, ModelConfig>();

/**
 * Registers one or more models in the singleton registry. Call once at worker startup before starting the worker.
 * @param configs - Map of model id → ModelConfig (provider, model, optional temperature/maxTokens)
 */
export function defineModels(configs: Record<string, ModelConfig>): void {
  for (const [id, cfg] of Object.entries(configs)) {
    if (!providerFactories[cfg.provider]) {
      throw new Error(
        `Unknown provider "${cfg.provider}" for model "${id}". ` +
          `Available: ${Object.keys(providerFactories).join(', ')}`,
      );
    }
    registry.set(id, cfg);
  }
}

/**
 * Returns the raw config for a registered model. Used internally for cost calculation and provider resolution.
 * @param modelId - The id passed to defineModels (e.g. "fast", "reasoning")
 * @throws If the model is not registered
 */
export function getModelConfig(modelId: string): ModelConfig {
  const cfg = registry.get(modelId);
  if (!cfg) {
    throw new Error(
      `Model "${modelId}" not registered. Call defineModels() first.`,
    );
  }
  return cfg;
}

/**
 * Returns a Vercel AI SDK LanguageModel instance for the given model id, ready for generateText().
 * @param modelId - The id passed to defineModels
 */
export function getModelInstance(modelId: string): LanguageModel {
  const cfg = getModelConfig(modelId);
  const factory = providerFactories[cfg.provider]!;
  return factory(cfg.model);
}

/** Clears all registered models. Used mainly for tests. */
export function clearModelRegistry(): void {
  registry.clear();
}
