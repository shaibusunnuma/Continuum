/**
 * Durion SDK — durable workflows, agents, and graphs on Temporal.
 *
 * Usage:
 *   const runtime = createRuntime({ models: { fast: openai('gpt-4o-mini') }, tools: [myTool] });
 *   const worker = await createWorker({ runtime, workflowsPath: '...' });
 *   await worker.run();
 */
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
export { graph } from './temporal/graph-workflow';
export { reducers } from './graph/reducers';
export { exportTopology } from './graph/topology';
// Worker factory
export { createWorker } from './temporal/worker-factory';
export type { CreateWorkerConfig, WorkerHandle } from './temporal/worker-factory';
// Client (for starting workflows programmatically)
export { createClient, resolveWorkflowType } from './temporal/client';
export type { SdkClient, WorkflowRun, CreateClientConfig, StartWorkflowOptions } from './temporal/client';
export type { ConnectionOptions } from '@temporalio/client';
export type { NativeConnectionOptions } from '@temporalio/worker';
export type {
  StudioRunPrimitive,
  StudioWorkflowExecutionSummary,
  ListWorkflowExecutionsParams,
  ListWorkflowExecutionsResult,
} from './temporal/studio-types';
// App (runtime + worker + client defaults)
export { createApp } from './app';
export type { App, CreateAppConfig } from './app';
/** Resolved env defaults (`TASK_QUEUE`, `TEMPORAL_ADDRESS`, …) after loading repo-root `.env`. */
export { config as durionConfig } from '../shared/config';
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
  GraphValidationError,
  GraphExecutionError,
  ERROR_CODES,
} from './errors';
// Lifecycle hooks (for plugins)
export { registerHook } from './hooks';
export type { LifecycleEvent, LifecycleHook } from './hooks';
// Types
export type {
  WorkflowContext,
  ChildRunOptions,
  ModelResult,
  ToolResult,
  Usage,
  CostAttribution,
  CostCalculationResult,
  CostCalculatorPayload,
  CostCalculator,
  Message,
  ModelOptions,
  ToolDefinition,
  AgentConfig,
  AgentResult,
  Delegate,
  ModelCallParams,
  RunMetadata,
  BudgetLimit,
  StreamState,
} from './types';
export {
  createTableCostCalculator,
  resolvePricingRow,
  parseEffectiveFromMs,
  pricingProviderMatches,
  normalizeCostCalculationResult,
  EXAMPLE_PRICING_ROWS,
} from './pricing';
export type { PricingRow } from './pricing';
// Graph types
export type {
  GraphContext,
  GraphConfig,
  GraphResult,
  GraphStreamState,
  GraphStreamStateEdge,
  GraphTopology,
  NodeFn,
  Edge,
  EdgeTarget,
  NodeRef,
  Reducer,
  GraphCheckpoint,
} from './graph/types';
// Streaming (token streaming via StreamBus + SSE helpers)
export type { StreamBus, StreamChunk } from './streaming/stream-bus';
export { LocalStreamBus } from './streaming/stream-bus';
export { pipeStreamToResponse } from './streaming/sse';
export { redisStreamChannelKey } from './streaming/stream-channel';
export { RedisStreamBus } from './streaming/redis-stream-bus';
export type { RedisStreamBusConfig } from './streaming/redis-stream-bus';
