import type { LanguageModel } from 'ai';
import type { ModelOptions } from '../types';
import { ConfigurationError, ModelNotFoundError } from '../errors';

// ---------------------------------------------------------------------------
// Model registry — store LanguageModel instances by id
// ---------------------------------------------------------------------------

/** Stored entry: model instance plus optional maxTokens override. */
interface ModelEntry {
  model: LanguageModel;
  maxTokens?: number;
}

const registry = new Map<string, ModelEntry>();

/**
 * Type guard: value is a wrapper object { model, maxTokens? } rather than a bare LanguageModel.
 */
function isModelWrapper(
  value: LanguageModel | { model: LanguageModel; maxTokens?: number },
): value is { model: LanguageModel; maxTokens?: number } {
  return (
    value != null &&
    typeof value === 'object' &&
    'model' in value &&
    (value as { model: unknown }).model != null &&
    typeof (value as { model: unknown }).model === 'object'
  );
}

function isValidLanguageModel(value: unknown): value is LanguageModel {
  return (
    value != null &&
    typeof value === 'object' &&
    'specificationVersion' in value &&
    'provider' in value
  );
}

function validateModelConfig(
  id: string,
  value: LanguageModel | { model: LanguageModel; maxTokens?: number },
): void {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new ConfigurationError('Model id must be a non-empty string.');
  }
  if (value == null || typeof value !== 'object') {
    throw new ConfigurationError(
      `Model "${id}": value must be a LanguageModel or { model, maxTokens? }.`,
    );
  }
  if (isModelWrapper(value)) {
    if (
      value.model == null ||
      typeof value.model !== 'object' ||
      !isValidLanguageModel(value.model)
    ) {
      throw new ConfigurationError(
        `Model "${id}": wrapper must have a valid LanguageModel in .model.`,
      );
    }
    if (
      value.maxTokens !== undefined &&
      (typeof value.maxTokens !== 'number' ||
        !Number.isInteger(value.maxTokens) ||
        value.maxTokens < 1)
    ) {
      throw new ConfigurationError(
        `Model "${id}": maxTokens must be a positive integer if set.`,
      );
    }
  } else if (!isValidLanguageModel(value)) {
    throw new ConfigurationError(
      `Model "${id}": value must be a Vercel AI SDK LanguageModel or { model, maxTokens? }.`,
    );
  }
}

/**
 * Registers one or more models by id. Pass Vercel AI SDK LanguageModel instances directly.
 * Call once at worker startup. No registerProvider or costKey; cost uses the instance's provider/modelId at runtime.
 *
 * @example
 * import { openai } from '@ai-sdk/openai';
 * import { defineModels } from '../src/sdk';
 * defineModels({
 *   fast: openai.chat('gpt-4o-mini'),
 *   reasoning: openai.chat('gpt-4o'),
 *   custom: { model: openai.chat('gpt-4o'), maxTokens: 4096 },
 * });
 *
 * @param configs - Map of model id → LanguageModel instance or { model, maxTokens? }
 */
export function defineModels(
  configs: Record<
    string,
    LanguageModel | { model: LanguageModel; maxTokens?: number }
  >,
): void {
  for (const [id, value] of Object.entries(configs)) {
    validateModelConfig(id, value);
    const entry: ModelEntry = isModelWrapper(value)
      ? { model: value.model, maxTokens: value.maxTokens }
      : { model: value, maxTokens: undefined };
    registry.set(id, entry);
  }
}

/**
 * Returns optional overrides for a registered model (e.g. maxTokens). Used by runModel activity.
 * @param modelId - The id passed to defineModels (e.g. "fast", "reasoning")
 * @throws If the model is not registered
 */
export function getModelOptions(modelId: string): ModelOptions {
  const entry = registry.get(modelId);
  if (!entry) {
    throw new ModelNotFoundError(modelId);
  }
  return { maxTokens: entry.maxTokens };
}

/**
 * Returns a Vercel AI SDK LanguageModel instance for the given model id, ready for generateText().
 * @param modelId - The id passed to defineModels
 */
export function getModelInstance(modelId: string): LanguageModel {
  const entry = registry.get(modelId);
  if (!entry) {
    throw new ModelNotFoundError(modelId);
  }
  return entry.model;
}

/** Clears all registered models. Used mainly for tests. */
export function clearModelRegistry(): void {
  registry.clear();
}
