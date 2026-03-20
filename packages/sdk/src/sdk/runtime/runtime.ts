/**
 * RuntimeContext — holds all SDK state (model registry, tool registry, hooks,
 * observability config) in a single instance.
 * Usage:
 *   const runtime = createRuntime({ models: { ... }, tools: [ ... ] });
 *   const worker = await createWorker({ runtime, workflowsPath: require.resolve('./workflows') });
 *   await worker.run();
 * (createWorker is a standalone import from '@ai-runtime/sdk', not a method on RuntimeContext.)
 */
import type { LanguageModel } from 'ai';
import type { ToolDefinition, ModelOptions } from '../types';
import type { LifecycleEvent, LifecycleHook } from '../hooks';
import type { ObservabilityConfig } from '../obs';
import { LocalStreamBus, type StreamBus } from '../streaming/stream-bus';
import { ConfigurationError, ModelNotFoundError, ToolNotRegisteredError } from '../errors';

// ---------------------------------------------------------------------------
// Model entry
// ---------------------------------------------------------------------------

interface ModelEntry {
  model: LanguageModel;
  maxTokens?: number;
}

// ---------------------------------------------------------------------------
// RuntimeContext class
// ---------------------------------------------------------------------------

export class RuntimeContext {
  /** Model registry: id → ModelEntry */
  readonly models = new Map<string, ModelEntry>();
  /** Tool registry: name → ToolDefinition */
  readonly tools = new Map<string, ToolDefinition>();
  /** Lifecycle hooks */
  readonly hooks: LifecycleHook[] = [];
  /** Observability config */
  tracingEnabled = false;
  metricsEnabled = false;
  /** Ephemeral streaming bus for token streaming (out-of-band from Temporal history). */
  streamBus: StreamBus = new LocalStreamBus();

  // -- Models --

  getModelInstance(modelId: string): LanguageModel {
    const entry = this.models.get(modelId);
    if (!entry) throw new ModelNotFoundError(modelId);
    return entry.model;
  }

  getModelOptions(modelId: string): ModelOptions {
    const entry = this.models.get(modelId);
    if (!entry) throw new ModelNotFoundError(modelId);
    return { maxTokens: entry.maxTokens };
  }

  // -- Tools --

  getToolDefinition(name: string): ToolDefinition {
    const def = this.tools.get(name);
    if (!def) throw new ToolNotRegisteredError(name);
    return def;
  }

  // -- Hooks --

  registerHook(hook: LifecycleHook): void {
    this.hooks.push(hook);
  }

  async dispatchHooks(event: LifecycleEvent): Promise<void> {
    for (const hook of this.hooks) {
      try {
        await hook(event);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[ai-runtime] Lifecycle hook failed:', err);
      }
    }
  }

  clearHooks(): void {
    this.hooks.length = 0;
  }

  // -- Observability --

  initObservability(config: ObservabilityConfig): void {
    this.tracingEnabled = !!config.tracing?.enabled;
    this.metricsEnabled = !!config.metrics?.enabled;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

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

export interface CreateRuntimeConfig {
  models?: Record<string, LanguageModel | { model: LanguageModel; maxTokens?: number }>;
  tools?: ToolDefinition[];
  observability?: ObservabilityConfig;
  streaming?: { bus?: StreamBus };
}

/**
 * Creates a new RuntimeContext with the given configuration.
 * @param config - Models, tools, and observability settings.
 * @returns A RuntimeContext instance.
 */
export function createRuntime(config: CreateRuntimeConfig = {}): RuntimeContext {
  const runtime = new RuntimeContext();

  // Configure streaming bus (defaults to LocalStreamBus)
  if (config.streaming?.bus) {
    runtime.streamBus = config.streaming.bus;
  }

  // Register models
  if (config.models) {
    for (const [id, value] of Object.entries(config.models)) {
      if (typeof id !== 'string' || id.trim() === '') {
        throw new ConfigurationError('Model id must be a non-empty string.');
      }
      if (value == null || typeof value !== 'object') {
        throw new ConfigurationError(
          `Model "${id}": value must be a LanguageModel or { model, maxTokens? }.`,
        );
      }
      if (isModelWrapper(value)) {
        if (!isValidLanguageModel(value.model)) {
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
        runtime.models.set(id, { model: value.model, maxTokens: value.maxTokens });
      } else if (isValidLanguageModel(value)) {
        runtime.models.set(id, { model: value, maxTokens: undefined });
      } else {
        throw new ConfigurationError(
          `Model "${id}": value must be a Vercel AI SDK LanguageModel or { model, maxTokens? }.`,
        );
      }
    }
  }

  // Register tools
  if (config.tools) {
    for (const def of config.tools) {
      if (typeof def.name !== 'string' || def.name.trim() === '') {
        throw new ConfigurationError('Tool name must be a non-empty string.');
      }
      if (runtime.tools.has(def.name)) {
        throw new ConfigurationError(`Tool "${def.name}": duplicate tool name.`);
      }
      if (typeof def.description !== 'string' || def.description.trim() === '') {
        throw new ConfigurationError(`Tool "${def.name}": description must be a non-empty string.`);
      }
      if (
        def.input == null ||
        typeof def.input !== 'object' ||
        typeof (def.input as { safeParse?: (v: unknown) => unknown }).safeParse !== 'function'
      ) {
        throw new ConfigurationError(
          `Tool "${def.name}": input must be a schema with a safeParse method (e.g. Zod schema).`,
        );
      }
      if (typeof def.execute !== 'function') {
        throw new ConfigurationError(`Tool "${def.name}": execute must be a function.`);
      }
      runtime.tools.set(def.name, def);
    }
  }

  // Configure observability
  if (config.observability) {
    runtime.initObservability(config.observability);
  }

  return runtime;
}

// ---------------------------------------------------------------------------
// Active runtime (singleton for use by activities and workflow adapters)
// ---------------------------------------------------------------------------

let activeRuntime: RuntimeContext | null = null;

/**
 * Sets the active runtime context for use by activities and workflow adapters.
 * Called internally by createWorker or can be used directly in tests.
 */
export function setActiveRuntime(runtime: RuntimeContext): void {
  activeRuntime = runtime;
}

/**
 * Returns the active runtime context. Throws if none has been set.
 */
export function getActiveRuntime(): RuntimeContext {
  if (!activeRuntime) {
    throw new ConfigurationError(
      'No active runtime. Call createRuntime() and pass it to createWorker(), or call setActiveRuntime() directly.',
    );
  }
  return activeRuntime;
}

/**
 * Clears the active runtime. Used for tests.
 */
export function clearActiveRuntime(): void {
  activeRuntime = null;
}
