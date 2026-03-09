# Part 6: Worker Factory and API Extensions

## Quick reference

| Function / type | Description |
|-----------------|-------------|
| `createWorker(cfg)` | Creates and runs a Temporal worker (runModel, runTool activities). Requires workflowsPath; optional taskQueue, temporalAddress, temporalNamespace. |
| `CreateWorkerConfig` | workflowsPath (required), taskQueue?, temporalAddress?, temporalNamespace?. |
| `POST /workflows/start` | Body: `{ workflowType, input }`. Returns `{ workflowId, runId }`. |
| `POST /agents/start` | Body: `{ agentName, input: { message } }`. Returns `{ workflowId, runId }`. |
| `GET /runs/:workflowId` | Returns run status (workflowId, status, type, startTime, closeTime). |
| `GET /runs/:workflowId/result` | Returns 202 if running, 200 with result when complete, or 200 with error for failed. |

SDK entry: `src/sdk/index.ts` re-exports workflow, agent, defineModels, defineTool, defineTools, createWorker, and the public types.

## Purpose

Wire everything together: a `createWorker()` function that hides all Temporal config, new API routes for starting agents and querying run status, and the public SDK entry point.

## createWorker(config)

### What the developer writes

```ts
import { createWorker, defineModels, defineTool } from '@ai-runtime/sdk';

defineModels({
  fast:      { provider: 'openai', model: 'gpt-4o-mini' },
  reasoning: { provider: 'openai', model: 'gpt-4o' },
});

defineTool({
  name: 'fetch_order',
  description: 'Look up an order by ID',
  input: z.object({ orderId: z.string() }),
  output: z.object({ status: z.string(), total: z.number() }),
  execute: async ({ orderId }) => ({ status: 'shipped', total: 42.0 }),
});

await createWorker({
  taskQueue: 'my-app',
  workflowsPath: require.resolve('./my-workflows'),
});
```

### What happens

1. Connects to Temporal via `NativeConnection`
2. Creates a `Worker` with:
   - The developer's `workflowsPath` (which exports their `workflow()` and `agent()` calls)
   - `activities` set to `{ runModel, runTool }` from our SDK
   - The `taskQueue` from config
3. Starts the worker loop

### Config interface

```ts
interface CreateWorkerConfig {
  workflowsPath: string;
  taskQueue?: string;           // defaults to config.TASK_QUEUE
  temporalAddress?: string;     // defaults to config.TEMPORAL_ADDRESS
  temporalNamespace?: string;   // defaults to config.TEMPORAL_NAMESPACE
}
```

## API routes

### Extended `POST /workflows/start`

Now accepts any registered workflow type (not just 'Echo'). The body validation becomes dynamic.

```
POST /workflows/start
{
  "workflowType": "customer-support",
  "input": { "message": "Where is my order?", "orderId": "abc-123" }
}
```

### New `POST /agents/start`

Starts an agent by name.

```
POST /agents/start
{
  "agentName": "travel-agent",
  "input": { "message": "Book me a flight to London" }
}
```

Returns `{ workflowId, runId }`.

### New `GET /runs/:workflowId`

Queries Temporal for workflow execution status.

```json
{
  "workflowId": "abc-123",
  "status": "RUNNING",
  "startTime": "2026-03-08T...",
  "type": "customer-support"
}
```

### New `GET /runs/:workflowId/result`

Queries Temporal for the workflow result. Returns 202 if still running, 200 with the result if complete.

```json
{
  "workflowId": "abc-123",
  "status": "COMPLETED",
  "result": { ... }
}
```

## Public SDK entry point (`src/sdk/index.ts`)

Re-exports everything developers need from one import:

```ts
export { workflow } from './temporal/workflow-adapter';
export { agent } from './temporal/agent-workflow';
export { defineModels } from './ai/model-registry';
export { defineTool, defineTools } from './ai/tool-registry';
export { createWorker } from './temporal/worker-factory';

// Types
export type {
  WorkflowContext,
  ModelResult,
  ToolResult,
  Usage,
  Message,
  ModelConfig,
  ToolDefinition,
  AgentConfig,
  AgentResult,
  ModelCallParams,
  RunMetadata,
  BudgetLimit,
} from './types';
```

## Files

- `src/sdk/temporal/worker-factory.ts`
- `src/sdk/index.ts` (public API)
- `src/api/routes/workflows.ts` (extend existing)
- `src/api/routes/agents.ts` (new)
- `src/api/routes/runs.ts` (new)
