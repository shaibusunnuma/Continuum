/**
 * AI Runtime SDK — durable workflows and agents on Temporal.
 * Export workflow/agent from your workflow file; use defineModels, defineTool, createWorker in your worker entry.
 */
// Workflow primitives (re-exported for developer's workflow files)
export { workflow } from './temporal/workflow-adapter';
export { agent } from './temporal/agent-workflow';

// Configuration (called at worker startup)
export { defineModels } from './ai/model-registry';
export { defineTool, defineTools } from './ai/tool-registry';

// Worker factory
export { createWorker } from './temporal/worker-factory';
export type { CreateWorkerConfig, WorkerHandle } from './temporal/worker-factory';

// Observability
export { initObservability, type ObservabilityConfig } from './obs';

// Errors (for programmatic handling)
export {
  AiRuntimeError,
  ModelNotFoundError,
  ToolNotRegisteredError,
  ToolValidationError,
  BudgetExceededError,
  ConfigurationError,
  ERROR_CODES,
} from './errors';

// Lifecycle hooks (for plugins)
export { registerHook, clearHooks } from './hooks';
export type { LifecycleEvent, LifecycleHook } from './hooks';

// Types
export type {
  WorkflowContext,
  ModelResult,
  ToolResult,
  Usage,
  Message,
  ModelOptions,
  ToolDefinition,
  AgentConfig,
  AgentResult,
  ModelCallParams,
  RunMetadata,
  BudgetLimit,
} from './types';
