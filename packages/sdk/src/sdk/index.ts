/**
 * AI Runtime SDK — durable workflows and agents on Temporal.
 *
 * Usage:
 *   const runtime = createRuntime({ models: { fast: openai('gpt-4o-mini') }, tools: [myTool] });
 *   const worker = await createWorker({ runtime, workflowsPath: '...' });
 *   await worker.run();
 */

// Runtime (replaces defineModels, defineTool, initObservability)
export {
  createRuntime,
  RuntimeContext,
  setActiveRuntime,
  getActiveRuntime,
  clearActiveRuntime,
} from './runtime';
export type { CreateRuntimeConfig } from './runtime';

// Workflow primitives (re-exported for developer's workflow files)
export { workflow } from './temporal/workflow-adapter';
export { agent } from './temporal/agent-workflow';

// Worker factory
export { createWorker } from './temporal/worker-factory';
export type { CreateWorkerConfig, WorkerHandle } from './temporal/worker-factory';

// Observability (standalone init for non-worker processes like API servers)
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
