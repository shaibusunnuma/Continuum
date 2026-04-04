# Durion SDK — Complete Reference for AI Agents

> **Purpose**: This document is a single-file, self-contained reference for the Durion SDK. It is designed so that an AI coding agent can read it and immediately implement any application using Durion — from a simple workflow to a multi-agent graph pipeline with streaming, human-in-the-loop, cost tracking, and observability.

---

## Table of Contents

1. [What Is Durion](#1-what-is-durion)
2. [Architecture Overview](#2-architecture-overview)
3. [Installation & Setup](#3-installation--setup)
4. [Core Concepts](#4-core-concepts)
5. [The Three Primitives](#5-the-three-primitives)
   - [5.1 workflow()](#51-workflow)
   - [5.2 agent()](#52-agent)
   - [5.3 graph()](#53-graph)
6. [Runtime & Worker Setup](#6-runtime--worker-setup)
7. [Client — Starting Workflows](#7-client--starting-workflows)
8. [Composability — ctx.run() & Delegates](#8-composability--ctxrun--delegates)
9. [Human-in-the-Loop (HITL)](#9-human-in-the-loop-hitl)
10. [Streaming (Token SSE)](#10-streaming-token-sse)
11. [Cost Tracking & Budgets](#11-cost-tracking--budgets)
12. [Observability (Tracing & Metrics)](#12-observability-tracing--metrics)
13. [Evaluation (@durion/eval)](#13-evaluation-durioneval)
14. [React Hooks (@durion/react)](#14-react-hooks-durionreact)
15. [Gateway API v0](#15-gateway-api-v0)
16. [CLI & Project Scaffolding](#16-cli--project-scaffolding)
17. [Environment Variables](#17-environment-variables)
18. [Error Handling](#18-error-handling)
19. [Complete API Reference](#19-complete-api-reference)
20. [Skills & Best Practices for Agents](#20-skills--best-practices-for-agents)

---

## 1. What Is Durion

Durion is a TypeScript SDK for **durable AI execution**. It provides three orchestration primitives — `workflow()`, `agent()`, and `graph()` — that turn LLM calls and tool executions into **replay-safe Temporal workflows**. Each `ctx.model()` and `ctx.tool()` call is a durable activity boundary: if a worker crashes, the run resumes from the last completed step.

**Key properties:**
- Built on **Temporal** (orchestration/durability) and the **Vercel AI SDK** (LLM calls).
- You never import `@temporalio/workflow` directly; use `@durion/sdk/workflow`.
- You bring your own AI SDK provider packages (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, etc.).
- Optional: streaming (Redis/local SSE), observability (OpenTelemetry), evaluation capture, React hooks, and a Studio UI.

**When to use Durion:**
- Multi-step AI pipelines where you need crash-safe resumption.
- Agent loops with durable tool execution and cost/token limits.
- Graph-shaped workflows with conditional branching, cycles, and parallel fan-out/fan-in.
- Human-in-the-loop approval flows.

**When NOT to use Durion:**
- Single-request chat completions in one HTTP handler (no durability needed).
- You need full control of every Temporal primitive.

---

## 2. Architecture Overview

Durion splits into three layers:

| Layer | What | Runs Where |
|-------|------|------------|
| **Authoring** | `workflow()`, `agent()`, `graph()` definitions | Bundled by Temporal into the worker |
| **Execution** | Worker process: `createWorker()` or `createApp()` + Temporal server | Node.js server process |
| **Optional HTTP + UI** | Gateway API v0, `@durion/react` hooks, Durion Studio | Your API server + browser |

**Data flow:**
1. Client starts a workflow via `createClient().start(fn, { input })` (Temporal gRPC).
2. Temporal dispatches to a worker polling the same `taskQueue`.
3. Worker executes workflow code; each `ctx.model()` / `ctx.tool()` is a Temporal activity.
4. Activities call LLMs via the Vercel AI SDK and execute tools with Zod validation.
5. Results flow back through Temporal history.
6. Optional: token deltas streamed out-of-band via `StreamBus` (Redis pub/sub or local EventEmitter).
7. Optional: `durion:streamState` query exposes progressive state for UIs.

---

## 3. Installation & Setup

### 3.1 Install packages

```bash
# Core SDK (worker or server process)
npm install @durion/sdk zod

# Your LLM provider (pick one or more)
npm install @ai-sdk/openai
# npm install @ai-sdk/anthropic
# npm install @ai-sdk/google

# Optional: React hooks for browser UIs
npm install @durion/react

# Optional: evaluation capture
npm install @durion/eval
```

### 3.2 Scaffold a new project (recommended)

```bash
npx create-durion@latest my-app
cd my-app && npm install && npx durion dev
```

### 3.3 Prerequisites

- **Node.js 20+**
- **Temporal server** running at `TEMPORAL_ADDRESS` (default `localhost:7233`).
  - Quick local: `temporal server start-dev` (Temporal CLI).
  - Or Docker / hosted Temporal Cloud.
- LLM provider API key in environment.

### 3.4 Environment (.env at project root)

```env
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
TASK_QUEUE=my-app-queue
OPENAI_API_KEY=sk-…
```

Load `.env` in your worker/client entrypoint: `import 'dotenv/config';`

---

## 4. Core Concepts

### 4.1 Workflow vs Agent vs Graph

| Primitive | You Write | Runtime Behavior | Best For |
|-----------|-----------|------------------|----------|
| `workflow()` | Async function with explicit steps | Temporal runs your code deterministically; each `ctx.model()`/`ctx.tool()` is a durable activity | Sequential pipelines, custom branching, HITL flows |
| `agent()` | Declarative config (model, instructions, tools) | SDK generates a model→tool loop that repeats until done or limits hit | LLM-driven tool selection, autonomous agents |
| `graph()` | Topology: nodes + edges + Zod state schema | Compiles to a Temporal workflow with parallel batching, conditional routing, cycle limits | DAG pipelines, fan-out/fan-in, iterative refinement loops |

### 4.2 The Context Object (`ctx`)

Inside `workflow()` and graph nodes:

| Method/Property | Type | Description |
|-----------------|------|-------------|
| `ctx.input` | `TInput` | Typed workflow input (workflows only; graphs use `ctx.state`) |
| `ctx.state` | `Readonly<TState>` | Current graph state snapshot (graphs only) |
| `ctx.model(modelId, params)` | `Promise<ModelResult>` | Call a registered LLM model by ID. Returns `{ result: string, usage: Usage }` |
| `ctx.tool(name, input, opts?)` | `Promise<ToolResult<T>>` | Execute a registered tool with Zod validation. Returns `{ result: T }` |
| `ctx.run(child, input, opts?)` | `Promise<TOutput>` | Execute a child workflow/agent/graph as a Temporal child workflow |
| `ctx.waitForInput(desc)` | `Promise<T>` | HITL: pause until a `durion:user-input` signal arrives |
| `ctx.waitForSignal(name, timeoutMs?)` | `Promise<T \| null>` | Wait for a specific named signal; returns null on timeout |
| `ctx.log(event, data?)` | `void` | Structured logging to Temporal |
| `ctx.metadata` | `RunMetadata` | `{ id, workflowName, startedAt, accumulatedCost }` |
| `ctx.lastError` | `GraphNodeError?` | Graph only: error from failed predecessor in onError fallback nodes |

### 4.3 What "Durable" Means

- `ctx.model()` and `ctx.tool()` execute inside Temporal activities.
- If the worker crashes, Temporal replays the workflow from the last completed activity.
- Agent loops execute one model call per activity boundary + separate tool activities.
- Durability is **orchestration** durability. Tool implementations should still be idempotent where possible.

### 4.4 Import Paths

**Critical rule:** Workflow files (loaded by Temporal's bundler) must only import from `@durion/sdk/workflow`. Worker/server files import from `@durion/sdk`.

```typescript
// ✅ workflows.ts (Temporal-bundled)
import { workflow, agent, graph, reducers, exportTopology } from '@durion/sdk/workflow';
import type { WorkflowContext, AgentConfig, GraphContext } from '@durion/sdk/workflow';

// ✅ worker.ts (Node process)
import { createRuntime, createWorker, createClient, createApp } from '@durion/sdk';
```

---

## 5. The Three Primitives

### 5.1 `workflow()`

**Signature:**
```typescript
function workflow<TInput, TOutput>(
  name: string,
  fn: (ctx: WorkflowContext<TInput>) => Promise<TOutput>,
): (input: TInput) => Promise<TOutput>;
```

**Usage — define in workflows.ts:**
```typescript
import { workflow } from '@durion/sdk/workflow';

export const myWorkflow = workflow('myWorkflow', async (ctx) => {
  // Step 1: Call an LLM
  const reply = await ctx.model('fast', {
    prompt: `Summarize: ${ctx.input.topic}`,
  });

  // Step 2: Call a tool
  const data = await ctx.tool('fetchData', { query: ctx.input.topic });

  // Step 3: Human approval
  const approval = await ctx.waitForInput<{ approved: boolean }>('Review needed');
  if (!approval.approved) return { status: 'rejected' };

  // Step 4: Call a child workflow — `ctx.run` resolves to that child's return value
  const refined = await ctx.run(refineWorkflow, { text: reply.result });

  return {
    summary: refined.output, // only if refineWorkflow returns { output: string }; adjust to match your child
    cost: ctx.metadata.accumulatedCost,
  };
});
```

**`ctx.model()` params (`ModelCallParams`):**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `prompt` | `string?` | — | Simple single-message prompt (added as a user message) |
| `messages` | `Message[]?` | — | Full conversation history. Use instead of `prompt` for multi-turn |
| `tools` | `string[]?` | — | Tool names to make available to the model |
| `stream` | `boolean?` | `false` | Stream token deltas via the runtime StreamBus |
| `schema` | `Record<string, unknown>?` | — | JSON Schema for structured output (uses `generateObject()` internally). Pass `z.toJSONSchema(myZodSchema)` |
| `responseFormat` | `'text' \| 'json'?` | `'text'` | Response format hint |
| `costCalculator` | `string?` | — | Name of a registered cost calculator |
| `timeout` | `string \| number?` | `'5 minutes'` | Override activity timeout for this call |

**`ModelResult`:**
```typescript
interface ModelResult {
  result: string;        // Text output or JSON string (when schema is set)
  usage: Usage;          // { promptTokens, completionTokens, totalTokens, costUsd, costAttribution? }
}
```

**Structured output example:**
```typescript
import { z } from 'zod';

const reply = await ctx.model('fast', {
  prompt: 'Rate this article 0-100',
  schema: z.toJSONSchema(z.object({ score: z.number(), reason: z.string() })),
});
const parsed = JSON.parse(reply.result); // { score: 85, reason: "..." }
```

### 5.2 `agent()`

**Signature:**
```typescript
function agent(
  name: string,
  config: AgentConfig,
): (input: { message: string }) => Promise<AgentResult>;
```

**`AgentConfig`:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `model` | `string` | ✅ | — | Registered model ID |
| `instructions` | `string` | ✅ | — | System prompt |
| `tools` | `string[]` | ✅ | — | Registered tool names (can be empty `[]`) |
| `maxSteps` | `number` | ❌ | `10` | Max model→tool iterations |
| `budgetLimit` | `BudgetLimit?` | ❌ | — | `{ maxCostUsd?, maxTokens? }` |
| `costCalculator` | `string?` | ❌ | — | Cost calculator name |
| `activityTimeout` | `string \| number?` | ❌ | `'5 minutes'` | Timeout for all model/tool activities |
| `delegates` | `Delegate[]?` | ❌ | — | Child workflows/agents exposed as tools |

**`AgentResult`:**
```typescript
interface AgentResult {
  reply: string;
  finishReason: 'complete' | 'max_steps' | 'budget_exceeded';
  steps: number;
  usage: Usage;
}
```

**Usage:**
```typescript
import { agent } from '@durion/sdk/workflow';

export const myAgent = agent('myAgent', {
  model: 'fast',
  instructions: 'You are a helpful assistant. Use tools when needed.',
  tools: ['web_search', 'calculator'],
  maxSteps: 8,
  budgetLimit: { maxCostUsd: 0.50 },
});
```

**How the agent loop works internally:**
1. Build messages: `[system(instructions), user(input.message)]`
2. Call `runModel` activity with tools available
3. If model returns tool calls → execute each as a `runTool` activity (parallel) → append results → go to step 2
4. If model returns text (no tool calls) → return `AgentResult` with `finishReason: 'complete'`
5. If `maxSteps` reached → return with `finishReason: 'max_steps'`
6. If budgetLimit exceeded → return with `finishReason: 'budget_exceeded'`

### 5.3 `graph()`

**Signature:**
```typescript
function graph<TState, TNodes>(
  name: string,
  config: GraphConfig<TState, TNodes>,
): ((input: Partial<TState>) => Promise<GraphResult<TState>>) & { topology: GraphTopology };
```

**`GraphConfig` fields:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `state` | `ZodType<TState>` | ✅ | — | Zod schema; validates input and provides defaults |
| `nodes` | `Record<string, NodeFn<TState>>` | ✅ | — | Node functions: `(ctx: GraphContext) => Promise<Partial<TState> \| void>` |
| `edges` | `Edge<TState, TNodes>[]` | ✅ | — | Edge definitions (static, fan-out, or conditional) |
| `entry` | `string \| string[]` | ✅ | — | Entry node(s). Array for parallel start |
| `exits` | `string[]?` | ❌ | inferred | Explicit exit nodes; if omitted, inferred from nodes with no outgoing edges |
| `maxIterations` | `number?` | ❌ | `25` | Max total node executions before forced termination |
| `onError` | `Record<string, string>?` | ❌ | — | `{ failingNode: 'fallbackNode' }` |
| `reducers` | `Record<string, Reducer>?` | ❌ | — | Per-field merge functions for parallel conflicts |
| `budgetLimit` | `BudgetLimit?` | ❌ | — | Cost/token limits |
| `canThreshold` | `number?` | ❌ | `10000` | Temporal history events threshold for Continue-As-New |

**Edge types:**

```typescript
// Static: always A → B
{ from: 'A', to: 'B' }

// Fan-out: A → B and C in parallel
{ from: 'A', to: ['B', 'C'] }

// Conditional: route based on state
{ from: 'A', to: (state) => state.score > 70 ? 'approve' : 'reject' }

// Exit: empty array terminates the graph
{ from: 'evaluate', to: (state) => state.score >= 80 ? [] : ['refine'] }
```

**Fan-in**: A node with multiple incoming edges waits until ALL predecessors complete.

**`GraphResult`:**
```typescript
interface GraphResult<TState> {
  output: TState;           // Final state
  status: 'completed' | 'max_iterations' | 'budget_exceeded' | 'error';
  executedNodes: string[];  // Execution order
  totalUsage: Usage;
  error?: { node: string; message: string };
}
```

**Complete graph example:**
```typescript
import { graph, reducers } from '@durion/sdk/workflow';
import { z } from 'zod';

const State = z.object({
  topic: z.string(),
  findings: z.array(z.string()).default([]),
  quality: z.number().default(0),
  finalReport: z.string().optional(),
});

export const researchPipeline = graph('researchPipeline', {
  state: State,
  nodes: {
    research: async (ctx) => {
      const r = await ctx.model('fast', {
        prompt: `Research: ${ctx.state.topic}`,
      });
      return { findings: [r.result] };
    },
    evaluate: async (ctx) => {
      const r = await ctx.model('fast', {
        prompt: `Rate quality 0-100: ${ctx.state.findings.join('\n')}`,
        schema: z.toJSONSchema(z.object({ score: z.number() })),
      });
      return { quality: JSON.parse(r.result).score };
    },
    refine: async (ctx) => {
      const r = await ctx.model('fast', {
        prompt: `Improve: ${ctx.state.findings.join('\n')}`,
      });
      return { findings: [...ctx.state.findings, r.result] };
    },
    publish: async (ctx) => {
      const r = await ctx.model('fast', {
        prompt: `Write final report: ${ctx.state.findings.join('\n')}`,
      });
      return { finalReport: r.result };
    },
  },
  edges: [
    { from: 'research', to: 'evaluate' },
    { from: 'evaluate', to: (state) => state.quality >= 70 ? 'publish' : 'refine' },
    { from: 'refine', to: 'evaluate' },
  ],
  entry: 'research',
  maxIterations: 10,
});
```

**Parallel fan-out with reducers:**
```typescript
export const parallelSearch = graph('parallelSearch', {
  state: z.object({
    query: z.string(),
    results: z.array(z.string()).default([]),
    webData: z.string().optional(),
    dbData: z.string().optional(),
    merged: z.string().optional(),
  }),
  nodes: {
    searchWeb: async (ctx) => {
      const r = await ctx.model('fast', { prompt: `Web search: ${ctx.state.query}` });
      return { webData: r.result, results: ['web'] };
    },
    searchDb: async (ctx) => {
      const r = await ctx.tool('dbSearch', { query: ctx.state.query });
      return { dbData: JSON.stringify(r.result), results: ['db'] };
    },
    merge: async (ctx) => {
      const r = await ctx.model('fast', {
        prompt: `Merge: ${ctx.state.webData} + ${ctx.state.dbData}`,
      });
      return { merged: r.result };
    },
  },
  edges: [
    { from: 'searchWeb', to: 'merge' },
    { from: 'searchDb', to: 'merge' },
  ],
  entry: ['searchWeb', 'searchDb'],  // Parallel start
  reducers: { results: reducers.append },  // Concat arrays from parallel nodes
});
```

**Error handling in graphs:**
```typescript
export const resilient = graph('resilient', {
  state: z.object({ input: z.string(), result: z.string().optional() }),
  nodes: {
    process: async (ctx) => {
      const r = await ctx.model('fast', { prompt: ctx.state.input });
      return { result: r.result };
    },
    fallback: async (ctx) => {
      // ctx.lastError contains info about the failure
      const r = await ctx.model('cheap', { prompt: ctx.state.input });
      return { result: r.result };
    },
  },
  // After a successful `process`, exit via a conditional edge returning [].
  // (`onError` routes failures to `fallback`; `fallback` has no outgoing edges → terminal.)
  edges: [{ from: 'process', to: () => [] }],
  onError: { process: 'fallback' },
  entry: 'process',
});
```

**Built-in reducers:**

| Reducer | Signature | Behavior |
|---------|-----------|----------|
| `reducers.append` | `(T[], T[]) => T[]` | Concatenates arrays |
| `reducers.merge` | `(T, T) => T` | Shallow merge (one level deeper) |

**Topology export:**
```typescript
import { exportTopology } from '@durion/sdk/workflow';
const json = exportTopology(researchPipeline);
// Returns JSON string: { name, nodes, edges, entry, exits }
```

---

## 6. Runtime & Worker Setup

### 6.1 `createRuntime(config)`

Creates a `RuntimeContext` that holds model registry, tool registry, cost calculators, and streaming bus.

```typescript
import { createRuntime } from '@durion/sdk';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const runtime = createRuntime({
  // Model registry: id → LanguageModel or { model, maxTokens? }
  models: {
    fast: openai.chat('gpt-4o-mini'),
    reasoning: openai.chat('gpt-4o'),
    with_limit: { model: openai.chat('gpt-4o-mini'), maxTokens: 2048 },
  },

  // Tool definitions: name, description, Zod input/output, execute function
  tools: [
    {
      name: 'web_search',
      description: 'Search the web for information',
      input: z.object({ query: z.string() }),
      output: z.object({ results: z.array(z.string()) }),
      execute: async ({ query }) => ({ results: [`Result for: ${query}`] }),
      timeout: '2 minutes', // Optional per-tool timeout
    },
  ],

  // Optional: cost calculators
  costCalculators: {
    'my-pricing': createTableCostCalculator('my-table', MY_PRICING_ROWS),
  },

  // Optional: observability
  observability: { tracing: { enabled: true }, metrics: { enabled: true } },

  // Optional: streaming bus (default: LocalStreamBus)
  streaming: { bus: new RedisStreamBus({ url: process.env.REDIS_URL }) },
});
```

### 6.2 `createWorker(config)`

Creates a Temporal worker that polls a task queue and executes workflow activities.

```typescript
import { createRuntime, createWorker } from '@durion/sdk';

const runtime = createRuntime({ /* ... */ });

const handle = await createWorker({
  runtime,
  workflowsPath: require.resolve('./workflows'),
  taskQueue: process.env.TASK_QUEUE ?? 'durion',  // Optional (default from env)
  temporalAddress: 'localhost:7233',               // Optional (default from env)
  temporalNamespace: 'default',                    // Optional (default from env)
});

await handle.run();  // Blocks until shutdown
```

`WorkerHandle` methods:
- `run()` — blocks until worker stops
- `shutdown()` — graceful shutdown; call from signal handlers

### 6.3 `createApp(config)` (convenience)

Wires `createRuntime` + `createWorker` + `createClient` with shared Temporal settings.

```typescript
import { createApp } from '@durion/sdk';
import { openai } from '@ai-sdk/openai';

const app = await createApp({
  models: { fast: openai.chat('gpt-4o-mini') },
  tools: [/* ... */],
  workflowsPath: require.resolve('./workflows'),
  taskQueue: 'my-queue',
});

// Worker process:
const worker = await app.createWorker();
await worker.run();

// Or start workflows from the same app:
const handle = await app.start(myWorkflow, { input: { message: 'Hello' } });
const result = await handle.result();
await app.close();
```

**`App` interface:**
- `runtime` — the RuntimeContext
- `workflowsPath`, `taskQueue` — resolved config
- `createWorker(overrides?)` — creates a worker
- `client()` — returns cached `SdkClient`
- `start(workflow, options)` — type-safe start
- `startWorkflow(type, options)` — string-based start
- `close()` — close cached client connection

---

## 7. Client — Starting Workflows

### 7.1 `createClient(config?)`

Creates a Temporal client for starting/querying workflows.

```typescript
import { createClient } from '@durion/sdk';
import { myWorkflow, myAgent } from './workflows';

const client = await createClient({
  taskQueue: 'my-queue',      // Optional; defaults to TASK_QUEUE env
  temporalAddress: '...',     // Optional; defaults to TEMPORAL_ADDRESS env
  temporalNamespace: '...',   // Optional; defaults to TEMPORAL_NAMESPACE env
});
```

### 7.2 Starting workflows

```typescript
// Type-safe start (recommended — uses function reference)
const handle = await client.start(myWorkflow, {
  input: { topic: 'AI safety' },
  workflowId: 'custom-id-123',  // Optional; auto-generated if omitted
  taskQueue: 'override-queue',   // Optional; overrides client default
});

// String-based start (for REST bridges)
const handle2 = await client.startWorkflow('myWorkflow', {
  input: { topic: 'AI safety' },
});

// Get result
const result = await handle.result();

// Query progressive state
const state = await handle.queryStreamState();

// Send signal (HITL)
await handle.signal('durion:user-input', { action: 'approve' });

// Cancel
await handle.cancel();

// Describe
const desc = await handle.describe();

// Close when done
await client.close();
```

### 7.3 `getWorkflowHandle(workflowId, runId?)`

Get a handle to an already-running workflow.

```typescript
const existing = client.getWorkflowHandle<MyResultType>('workflow-id-123');
const result = await existing.result();
```

---

## 8. Composability — ctx.run() & Delegates

### 8.1 `ctx.run()` — Child workflows

Any workflow, agent, or graph can call another as a child Temporal workflow:

```typescript
import { workflow, agent } from '@durion/sdk/workflow';

export const researcher = agent('researcher', {
  model: 'fast',
  instructions: 'You research topics.',
  tools: ['web_search'],
});

export const pipeline = workflow('pipeline', async (ctx) => {
  // Run agent as child workflow
  const research = await ctx.run(researcher, { message: ctx.input.topic });

  // Run another workflow as child
  const summary = await ctx.run(summarizer, { text: research.reply });

  return summary;
});
```

**Options for `ctx.run()`:**
```typescript
await ctx.run(child, input, {
  taskQueue: 'different-queue',  // Optional
  workflowId: 'custom-id',      // Optional
});
```

### 8.2 `delegates` — Agents calling agents as tools

Expose child workflows/agents as tools inside an agent's tool loop:

```typescript
export const specialist = agent('specialist', {
  model: 'fast',
  instructions: 'You are a domain expert.',
  tools: [],
});

export const orchestrator = agent('orchestrator', {
  model: 'reasoning',
  instructions: 'You coordinate. Call specialist when you need expert help.',
  tools: ['formatter'],
  delegates: [
    {
      name: 'specialist',
      description: 'Ask the specialist for expert analysis. Pass { message: "..." }',
      fn: specialist,
    },
  ],
});
```

When the model calls the `specialist` tool, the SDK executes `specialist` as a Temporal child workflow (not an activity) and returns the result to the model's tool loop.

---

## 9. Human-in-the-Loop (HITL)

### 9.1 `ctx.waitForInput()`

Pauses workflow execution until a signal arrives:

```typescript
export const approvalFlow = workflow('approvalFlow', async (ctx) => {
  const draft = await ctx.model('fast', { prompt: 'Draft a response...' });

  // Pauses here — sets streamState.status = 'waiting_for_input'
  const approval = await ctx.waitForInput<{ approved: boolean; feedback?: string }>(
    'Human review needed',
  );

  if (!approval.approved) {
    return { status: 'rejected', feedback: approval.feedback };
  }
  return { status: 'approved', draft: draft.result };
});
```

### 9.2 `ctx.waitForSignal(name, timeoutMs?)`

Wait for a specific named signal (more flexible than `waitForInput`):

```typescript
const data = await ctx.waitForSignal<{ decision: string }>('my-custom-signal', 30000);
if (data === null) {
  // Timeout expired
}
```

### 9.3 Sending signals

**From code (client):**
```typescript
await handle.signal('durion:user-input', { approved: true });
// Or custom signal:
await handle.signal('my-custom-signal', { decision: 'go' });
```

**From HTTP (Gateway v0):**
```
POST /v0/runs/{workflowId}/signal
{ "name": "durion:user-input", "data": { "approved": true } }
```

The default HITL signal name is `durion:user-input`.

---

## 10. Streaming (Token SSE)

Durion separates **durable completion** (workflow result via Temporal) from **ephemeral token streaming** (out-of-band via StreamBus).

### 10.1 Enable streaming on a model call

```typescript
const reply = await ctx.model('fast', {
  prompt: 'Write an essay...',
  stream: true,  // Streams token deltas to the StreamBus
});
// reply.result still contains the full text after completion
```

### 10.2 StreamBus types

- **`LocalStreamBus`** — in-process EventEmitter. Use when worker and API share a process.
- **`RedisStreamBus`** — Redis pub/sub. Use when API and worker are separate processes.

```typescript
import { createRuntime, RedisStreamBus } from '@durion/sdk';

const runtime = createRuntime({
  models: { /* ... */ },
  streaming: {
    bus: new RedisStreamBus({ url: process.env.REDIS_URL }),
  },
});
```

### 10.3 Serve SSE

```typescript
import { pipeStreamToResponse } from '@durion/sdk';

// Express-style handler (`pipeStreamToResponse` is async — await it)
app.get('/v0/runs/:id/token-stream', async (req, res) => {
  const workflowId = req.params.id;
  await pipeStreamToResponse(runtime.streamBus, workflowId, res);
});
```

### 10.4 Subscribe-before-start pattern

Pub/sub channels are keyed by `workflowId`. Earlier chunks are NOT replayed.

**Recommended:** Allocate a `workflowId`, open SSE, THEN start the workflow:

```typescript
const workflowId = `myRun-${crypto.randomUUID()}`;
// 1. Client opens SSE to /v0/runs/{workflowId}/token-stream
// 2. THEN start the workflow:
const handle = await client.start(myWorkflow, {
  input: { prompt: 'Hello' },
  workflowId,
});
```

### 10.5 Progressive state (no SSE needed)

All workflows expose a `durion:streamState` query:

```typescript
const state = await handle.queryStreamState();
// { status: 'running', currentStep: 3, partialReply: '...', messages: [...], updatedAt: '...' }
```

---

## 11. Cost Tracking & Budgets

### 11.1 Usage on model results

Every `ctx.model()` call returns `usage`:

```typescript
const reply = await ctx.model('fast', { prompt: '...' });
console.log(reply.usage);
// { promptTokens: 150, completionTokens: 50, totalTokens: 200, costUsd: 0.001 }
```

### 11.2 Accumulated cost

```typescript
// Inside a workflow():
const totalSoFar = ctx.metadata.accumulatedCost;
```

For `workflow()`, this value increases on each **`ctx.model()`** completion (usage from the LLM). It is **not** updated by **`ctx.tool()`** calls (tools have no costUsd in the SDK today). Graphs track **`totalUsage`** separately on the graph result; agents expose cost via **`AgentResult.usage`**.

### 11.3 Budget limits (agents and graphs)

```typescript
// Agent
export const budgetedAgent = agent('myAgent', {
  model: 'fast',
  instructions: '...',
  tools: ['search'],
  budgetLimit: { maxCostUsd: 1.00, maxTokens: 50000 },
});

// Graph
export const budgetedGraph = graph('myGraph', {
  state: MyState,
  nodes: { /* ... */ },
  edges: [ /* ... */ ],
  entry: 'start',
  budgetLimit: { maxCostUsd: 2.00 },
});
```

### 11.4 Cost calculators

Register custom pricing with `createTableCostCalculator`:

```typescript
import {
  createRuntime,
  createTableCostCalculator,
  EXAMPLE_PRICING_ROWS,
} from '@durion/sdk';
import type { PricingRow } from '@durion/sdk';

const MY_PRICING: PricingRow[] = [
  {
    provider: 'openai.chat',
    model: 'gpt-4o-mini',
    inputUsdPer1M: 0.15,
    outputUsdPer1M: 0.60,
    effectiveFrom: '2025-01-01',
  },
];

createRuntime({
  models: { fast: openai.chat('gpt-4o-mini') },
  costCalculators: {
    'my-pricing': createTableCostCalculator('openai-2025', MY_PRICING),
  },
});

// Reference in workflow or agent:
await ctx.model('fast', { prompt: '...', costCalculator: 'my-pricing' });
```

You can also write a fully custom calculator implementing `CostCalculator`:

```typescript
import type { CostCalculator, CostCalculatorPayload } from '@durion/sdk';

const customCalc: CostCalculator = {
  calculate: (payload: CostCalculatorPayload) => ({
    costUsd: payload.inputTokens * 0.001 + payload.outputTokens * 0.002,
    attribution: {
      kind: 'custom',
      pricingTableId: 'my-custom',
      inputUsdPer1M: 1.0,
      outputUsdPer1M: 2.0,
    },
  }),
};
```

---

## 12. Observability (Tracing & Metrics)

### 12.1 Enable tracing and metrics

```typescript
import { initObservability } from '@durion/sdk';

initObservability({
  tracing: { enabled: true },
  metrics: { enabled: true },
});
```

Or via `createRuntime`:
```typescript
createRuntime({
  models: { /* ... */ },
  observability: { tracing: { enabled: true }, metrics: { enabled: true } },
});
```

### 12.2 What gets traced

- **Spans**: `durion.run_model`, `durion.run_tool`
- **Attributes**: `durion.modelId`, `durion.toolName`, `durion.workflowId`, `durion.runId`, `durion.usage.*`, `durion.cost.*`
- **Metrics**: `ai_model_calls_total`, `ai_model_tokens_total`, `ai_model_cost_usd_total`, `ai_tool_calls_total`

`initObservability` / `createRuntime({ observability })` only **enable** tracing and metric recording via OpenTelemetry. Exposing a **Prometheus scrape endpoint** (for example on port `9464` via `DURION_PROMETHEUS_PORT`) is done by the **host process** (e.g. Durion Studio’s `studio-server`), not by `@durion/sdk` alone.

### 12.3 Export traces

Configure OpenTelemetry exporters in your process:
```env
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=my-durion-app
```

---

## 13. Evaluation (@durion/eval)

Optional plugin for capturing runs to Postgres for evaluation metrics.

```typescript
import { initEvaluation } from '@durion/eval';

initEvaluation({
  enabled: true,
  dbUrl: process.env.DURION_EVAL_DB_URL,
  defaultVariantName: 'baseline',
});
```

Requires Postgres with the eval schema applied. See `packages/eval/README.md`.

---

## 14. React Hooks (@durion/react)

### 14.1 Install

```bash
npm install @durion/react @durion/sdk react
```

### 14.2 Key hooks

**`useRunStream()`** — all-in-one: polls stream state + opens token SSE.

**`useGatewayStreamState({ workflowId, baseURL, pollIntervalMs? })`** — polls `GET /v0/runs/:id/stream-state`:

```tsx
import { useGatewayStreamState } from '@durion/react';

function RunStatus({ workflowId }: { workflowId: string }) {
  const { state, error, loading } = useGatewayStreamState({
    workflowId,
    baseURL: 'http://localhost:3000',
    pollIntervalMs: 1500,
  });
  if (!state) return <p>Loading...</p>;
  return <pre>{state.status} — step {state.currentStep}</pre>;
}
```

**`useGatewayTokenStream({ workflowId, baseURL, accessToken? })`** — opens SSE to `GET /v0/runs/:id/token-stream`.

**Low-level hooks** (custom URLs): `useWorkflowStreamState`, `useWorkflowTokenStream`.

**`useSendSignal({ baseURL })`** — sends signals via Gateway v0.

---

## 15. Gateway API v0

HTTP surface for browser/BFF clients. Paths are under `/v0`. In path parameters below, **`{runId}` is the Temporal workflow id** (often client-chosen before start so SSE can subscribe first). Optional query `runId=<temporal execution run id>` pins a specific execution when the same workflow id is reused.

**Which server implements what:** The monorepo ships multiple gateways. **`npx durion dev`** starts the **CLI built-in gateway** (`@durion/cli`), which today exposes **`/v0/studio/*`** and a **minimal** **`/v0/runs/*`** (stream-state, describe, result) — not token SSE, signals, or HTTP workflow/agent start. The **full** v0 surface (token-stream, signal, `POST /v0/workflows/start`, `POST /v0/agents/start`) lives in **`examples/hitl-gateway`** and is the reference for self-hosted BFFs. See `docs/gateway-api-v0.md` for the canonical split.

### Runs

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v0/runs/{runId}/stream-state` | Returns `StreamState` JSON |
| `GET` | `/v0/runs/{runId}/token-stream` | SSE token stream (reference: `hitl-gateway`; not on CLI dev gateway) |
| `POST` | `/v0/runs/{runId}/signal` | Send signal: `{ "name": "...", "data": ... }` (reference: `hitl-gateway`) |
| `GET` | `/v0/runs/{runId}` | Workflow description |
| `GET` | `/v0/runs/{runId}/result` | Workflow result (202 while running) |

### Workflows

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v0/workflows/start` | Start workflow: `{ workflowType, input, workflowId?, taskQueue? }` (reference: `hitl-gateway`; not on CLI dev gateway) |

### Agents

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v0/agents/start` | Start agent: `{ agentName, input: { message } }` (reference: `hitl-gateway`; not on CLI dev gateway) |

### Studio

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v0/studio/runs` | List workflow executions (paginated) |
| `GET` | `/v0/studio/runs/{workflowId}/spans` | Buffered OTLP-style spans (when enabled) |
| `GET` | `/v0/studio/runs/{workflowId}/history` | Full event history |

### Authentication

If `DURION_GATEWAY_TOKEN` is set:
- JSON/fetch: `Authorization: Bearer <token>`
- SSE (EventSource): `?access_token=<token>` query param

---

## 16. CLI & Project Scaffolding

### 16.1 `create-durion`

```bash
npx create-durion@latest my-app
```

Templates: `hello`, `agent`, `blank`. Interactive prompts for LLM provider and API key.

Flags: `--template`, `--llm`, `--llm-api-key`, `--default` (non-interactive), `--no-install`.

### 16.2 `@durion/cli`

```bash
npx durion dev      # Start Temporal + worker + gateway + Studio
npx durion doctor   # Check Node, Temporal CLI, .env
npx durion studio   # Start Studio UI only
```

Configuration via `durion.config.ts`:
```typescript
import { defineConfig } from '@durion/cli';

export default defineConfig({
  workflowsPath: './src/workflows.ts',
  workerEntrypoint: './src/worker.ts',
});
```

---

## 17. Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `TEMPORAL_ADDRESS` | `localhost:7233` | Temporal gRPC address |
| `TEMPORAL_NAMESPACE` | `default` | Temporal namespace |
| `TASK_QUEUE` | `durion` | Task queue (must match worker and client) |
| `API_PORT` | `3000` | Studio gateway port |
| `HITL_GATEWAY_PORT` | `3001` | HITL gateway port |
| `DURION_GATEWAY_TOKEN` | — | Bearer token for v0 endpoints |
| `REDIS_URL` | — | For RedisStreamBus |
| `DURION_EVAL_DB_URL` | — | Postgres for eval capture |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | OTLP trace endpoint |
| `OTEL_SERVICE_NAME` | — | Service name on spans |
| `DURION_PROMETHEUS_PORT` | `9464` | Prometheus scrape port |

LLM provider keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`, etc.) are read by the AI SDK provider packages, not by Durion directly.

---

## 18. Error Handling

### 18.1 Error hierarchy

All SDK errors extend `AiRuntimeError`:

| Error Class | Code | When |
|-------------|------|------|
| `ModelNotFoundError` | `MODEL_NOT_FOUND` | `ctx.model('unknown')` — model not registered |
| `ToolNotRegisteredError` | `TOOL_NOT_REGISTERED` | `ctx.tool('unknown')` — tool not registered |
| `ToolValidationError` | `TOOL_VALIDATION` | Tool input fails Zod validation |
| `BudgetExceededError` | `BUDGET_EXCEEDED` | Agent/graph exceeds budget limit |
| `ConfigurationError` | `CONFIGURATION` | Invalid config in `createRuntime`, `createWorker`, etc. |
| `GraphValidationError` | `GRAPH_VALIDATION` | Invalid graph definition (missing entry, bad edges, etc.) |
| `GraphExecutionError` | `GRAPH_EXECUTION` | Runtime graph error (invalid route, maxIterations exceeded) |

### 18.2 Programmatic handling

```typescript
import { ModelNotFoundError, BudgetExceededError } from '@durion/sdk';

try {
  const result = await handle.result();
} catch (err) {
  if (err instanceof BudgetExceededError) {
    // Handle budget exceeded
  }
}
```

---

## 19. Complete API Reference

### Exports from `@durion/sdk`

**Creating:**
- `createRuntime(config)` → `RuntimeContext`
- `createWorker(config)` → `Promise<WorkerHandle>`
- `createClient(config?)` → `Promise<SdkClient>`
- `createApp(config)` → `Promise<App>`

**Cost:**
- `createTableCostCalculator(id, rows)` → `CostCalculator`
- `EXAMPLE_PRICING_ROWS` — sample pricing data
- `resolvePricingRow`, `pricingProviderMatches`, `normalizeCostCalculationResult`, `parseEffectiveFromMs`

**Observability:**
- `initObservability(config)`

**Streaming:**
- `LocalStreamBus` — in-process bus
- `RedisStreamBus` — Redis pub/sub bus
- `pipeStreamToResponse(bus, channel, res)` — SSE helper
- `redisStreamChannelKey(workflowId, runId?)` — channel key builder

**Hooks:**
- `registerHook(hook)` — register lifecycle hook

**Errors:**
- `AiRuntimeError`, `ModelNotFoundError`, `ToolNotRegisteredError`, `ToolValidationError`, `BudgetExceededError`, `ConfigurationError`, `GraphValidationError`, `GraphExecutionError`, `ERROR_CODES`

### Exports from `@durion/sdk/workflow`

**Primitives:**
- `workflow(name, fn)` → workflow function
- `agent(name, config)` → agent workflow function
- `graph(name, config)` → graph workflow function with `.topology`

**Graph utilities:**
- `reducers` — `{ append, merge }`
- `exportTopology(graphFn)` → JSON string

**Types:**
- `WorkflowContext`, `GraphContext`, `GraphConfig`, `GraphResult`, `GraphStreamState`, `GraphTopology`, `NodeFn`, `Edge`, `EdgeTarget`, `NodeRef`, `Reducer`, `GraphCheckpoint`, `AgentConfig`, `AgentResult`, `ModelResult`, `ToolResult`, `Usage`, `Message`, `Delegate`, `ChildRunOptions`

### Lifecycle hooks

```typescript
import { registerHook } from '@durion/sdk';
import type { LifecycleEvent } from '@durion/sdk';

registerHook(async (event: LifecycleEvent) => {
  if (event.type === 'run:complete') {
    console.log(`${event.payload.kind} "${event.payload.name}" completed`);
  }
});
```

---

## 20. Skills & Best Practices for Agents

> **This section is written for AI coding agents.** Follow these rules when implementing Durion applications.

### SKILL 1: Project Structure

Always structure a Durion project with separate files for workflows and worker:

```
my-app/
├── .env                    # Environment variables
├── package.json
├── workflows.ts            # workflow(), agent(), graph() definitions
│                           # ONLY imports from '@durion/sdk/workflow' + 'zod'
├── worker.ts               # createRuntime, createWorker — the entry point
│                           # Imports from '@durion/sdk' + AI SDK providers
├── client.ts               # Optional: createClient for starting workflows
└── tools/                  # Optional: tool implementations in separate files
    └── search.ts
```

**Why:** Temporal bundles `workflows.ts` into a deterministic sandbox. It must not import Node.js modules, `@durion/sdk` (the full SDK), or any side-effect-producing code. Only `@durion/sdk/workflow` and pure type imports are allowed.

### SKILL 2: Workflow File Rules

In `workflows.ts`:
- ✅ Import from `@durion/sdk/workflow`
- ✅ Import `zod` (for graph state schemas)
- ✅ Use `import type` for type-only imports
- ❌ Never import from `@durion/sdk` (full SDK)
- ❌ Never import Node built-ins (`fs`, `path`, `http`)
- ❌ Never import AI SDK providers (`@ai-sdk/openai`)
- ❌ Never use `Date.now()`, `Math.random()`, or non-deterministic APIs
- ❌ Never use `require()` inside workflow functions

### SKILL 3: Choosing the Right Primitive

Use this decision tree:

1. **Is the control flow known at definition time?**
   - YES → Consider `workflow()` or `graph()`
   - NO (LLM decides what to do) → Use `agent()`

2. **Is it a simple sequence (< 5 steps)?**
   - YES → Use `workflow()` — it's simpler
   - NO → Continue...

3. **Do you need cycles, fan-out/fan-in, or declarative topology?**
   - YES → Use `graph()`
   - NO → Use `workflow()`

4. **Do you need the LLM to call tools autonomously?**
   - YES → Use `agent()` (possibly with `delegates` for multi-agent)
   - NO → Use `workflow()` with explicit `ctx.tool()` calls

### SKILL 4: Model Registration Pattern

Always register ALL model IDs that your workflows/agents reference:

```typescript
// worker.ts
createRuntime({
  models: {
    fast: openai.chat('gpt-4o-mini'),           // For speed
    reasoning: openai.chat('gpt-4o'),            // For quality
    cheap: openai.chat('gpt-4o-mini'),           // For fallbacks
  },
});
```

If a workflow calls `ctx.model('fast')`, the key `'fast'` must exist in the models registry. Mismatch → `ModelNotFoundError` at runtime.

### SKILL 5: Tool Registration Pattern

Tools must have: `name`, `description`, Zod `input` schema, Zod `output` schema, `execute` function.

```typescript
createRuntime({
  tools: [
    {
      name: 'search_web',               // Must match tools: ['search_web'] in agent config
      description: 'Search the web',     // LLM sees this — be descriptive
      input: z.object({
        query: z.string().describe('Search query'),
      }),
      output: z.object({
        results: z.array(z.string()),
      }),
      execute: async ({ query }) => {
        // Your implementation — this runs as a Temporal activity
        return { results: ['result 1', 'result 2'] };
      },
    },
  ],
});
```

### SKILL 6: Task Queue Alignment

**Critical:** Worker and client MUST use the same `TASK_QUEUE`. Mismatched queues = workflows never execute.

```typescript
// worker.ts
createWorker({ taskQueue: 'my-queue', /* ... */ });

// client.ts
createClient({ taskQueue: 'my-queue' });

// OR: set TASK_QUEUE in .env and omit from code
```

### SKILL 7: Graph State Design

- Use Zod schemas with `.default()` for all non-input fields:
  ```typescript
  const State = z.object({
    topic: z.string(),              // Required input
    results: z.array(z.string()).default([]),  // Default empty
    score: z.number().default(0),    // Default zero
    report: z.string().optional(),   // Optional output
  });
  ```
- Nodes return `Partial<TState>` — only the fields they modify.
- Use `reducers.append` for arrays updated by parallel nodes.
- Use `reducers.merge` for objects merged from parallel nodes.

### SKILL 8: Error Handling in Graphs

Use `onError` for graceful degradation:

```typescript
graph('myGraph', {
  nodes: {
    primary: async (ctx) => { /* may fail */ },
    fallback: async (ctx) => {
      if (ctx.lastError) {
        console.log(`Failed node: ${ctx.lastError.node}, error: ${ctx.lastError.message}`);
      }
      // Simpler/cheaper alternative
    },
  },
  onError: { primary: 'fallback' },
  // ...
});
```

### SKILL 9: Structured Output

Always use `z.toJSONSchema()` for structured output, not string parsing:

```typescript
const reply = await ctx.model('fast', {
  prompt: 'Classify this text...',
  schema: z.toJSONSchema(z.object({
    category: z.enum(['positive', 'negative', 'neutral']),
    confidence: z.number(),
  })),
});
const parsed = JSON.parse(reply.result);
```

### SKILL 10: Complete Worker Setup Template

Use this as a starting template for any Durion application:

```typescript
// worker.ts
import 'dotenv/config';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { createRuntime, createWorker, initObservability } from '@durion/sdk';

// 1. Optional: Enable observability
initObservability({
  tracing: { enabled: true },
  metrics: { enabled: true },
});

// 2. Create runtime with models and tools
const runtime = createRuntime({
  models: {
    fast: openai.chat('gpt-4o-mini'),
  },
  tools: [
    {
      name: 'my_tool',
      description: 'Does something useful',
      input: z.object({ query: z.string() }),
      output: z.object({ result: z.string() }),
      execute: async ({ query }) => ({ result: `Answer for: ${query}` }),
    },
  ],
});

// 3. Create and run worker
const handle = await createWorker({
  runtime,
  workflowsPath: require.resolve('./workflows'),
});

// 4. Graceful shutdown
process.on('SIGINT', () => handle.shutdown());
process.on('SIGTERM', () => handle.shutdown());

await handle.run();
```

### SKILL 11: Streaming Setup Template

For applications requiring real-time token streaming:

```typescript
// worker.ts — with streaming
import { createRuntime, createWorker, RedisStreamBus } from '@durion/sdk';

const runtime = createRuntime({
  models: { /* ... */ },
  streaming: {
    bus: new RedisStreamBus({ url: process.env.REDIS_URL! }),
  },
});
```

```typescript
// workflows.ts — enable streaming per model call
export const streamingWorkflow = workflow('streaming', async (ctx) => {
  const reply = await ctx.model('fast', {
    prompt: ctx.input.prompt,
    stream: true,  // Enables token streaming
  });
  return { reply: reply.result };
});
```

### SKILL 12: Multi-Agent Orchestration

For complex multi-agent systems, combine `graph()` with `ctx.run()`:

```typescript
// Define specialized agents
export const researcher = agent('researcher', {
  model: 'fast', instructions: 'Research topics.', tools: ['web_search'],
});

export const writer = agent('writer', {
  model: 'reasoning', instructions: 'Write reports.', tools: [],
});

// Graph coordinates agents
export const pipeline = graph('multiAgentPipeline', {
  state: z.object({
    topic: z.string(),
    research: z.string().default(''),
    report: z.string().default(''),
  }),
  nodes: {
    doResearch: async (ctx) => {
      const result = await ctx.run(researcher, { message: ctx.state.topic });
      return { research: result.reply };
    },
    writeReport: async (ctx) => {
      const result = await ctx.run(writer, { message: `Write report: ${ctx.state.research}` });
      return { report: result.reply };
    },
  },
  edges: [{ from: 'doResearch', to: 'writeReport' }],
  entry: 'doResearch',
});
```

### SKILL 13: Avoiding Common Pitfalls

1. **Never call `createRuntime()` in workflow files.** Runtime is set up in the worker process only.

2. **Never import `@durion/sdk` in workflow files.** Use `@durion/sdk/workflow`.

3. **Always register every model ID and tool name** used by your workflows/agents before starting the worker.

4. **Task queue mismatch is the #1 cause of "workflow never runs."** Always verify `TASK_QUEUE` is identical across worker and client.

5. **`workflowsPath` must point to the compiled output** if you're using TypeScript with a build step. Use `require.resolve('./workflows')` for auto-resolution.

6. **Graph cycle protection:** Always set `maxIterations` on cyclic graphs. The default is 25.

7. **Cost calculator reference:** If you specify `costCalculator: 'my-pricing'` in a model call, that calculator must be registered in `createRuntime({ costCalculators: { 'my-pricing': ... } })`.

8. **Signal name consistency:** The default HITL signal is `durion:user-input`. If you use `ctx.waitForSignal('custom-name')`, the client must signal with that exact name.

9. **Streaming subscribe-before-start:** When using Redis streaming, open the SSE connection BEFORE starting the workflow to avoid missing early tokens.

10. **Graph nodes are workflow code, not activities.** The activity boundaries are `ctx.model()`, `ctx.tool()`, and `ctx.run()` calls WITHIN the node. A single node can make multiple activity calls.

### SKILL 14: Complete Application Example

Here is a production-ready pattern combining workflow + agent + tools + cost tracking:

```typescript
// workflows.ts
import { workflow, agent } from '@durion/sdk/workflow';

export const sentryAgent = agent('sentryAgent', {
  model: 'reasoning',
  instructions: `You are an autonomous engineer. When given an error, 
    analyze it, search for context, propose a fix, and create a PR.`,
  tools: ['fetch_error_details', 'search_codebase', 'create_pull_request'],
  maxSteps: 12,
  budgetLimit: { maxCostUsd: 5.00 },
  costCalculator: 'prod-pricing',
});

export const sentryPipeline = workflow('sentryPipeline', async (ctx) => {
  // Run agent as child workflow
  const result = await ctx.run(sentryAgent, {
    message: `Fix this error: ${ctx.input.errorTitle}\n${ctx.input.stackTrace}`,
  });
  return {
    fix: result.reply,
    steps: result.steps,
    cost: result.usage.costUsd,
    finishReason: result.finishReason,
  };
});
```

```typescript
// worker.ts
import 'dotenv/config';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import {
  createApp,
  createTableCostCalculator,
  initObservability,
} from '@durion/sdk';

initObservability({ tracing: { enabled: true }, metrics: { enabled: true } });

const app = await createApp({
  models: {
    reasoning: openai.chat('gpt-4o'),
  },
  tools: [
    {
      name: 'fetch_error_details',
      description: 'Fetch full error details from Sentry',
      input: z.object({ issueId: z.string() }),
      output: z.object({ title: z.string(), stackTrace: z.string() }),
      execute: async ({ issueId }) => {
        // Your Sentry API call
        return { title: 'Error', stackTrace: '...' };
      },
    },
    {
      name: 'search_codebase',
      description: 'Search the codebase for relevant files',
      input: z.object({ query: z.string() }),
      output: z.object({ files: z.array(z.string()) }),
      execute: async ({ query }) => ({ files: ['src/main.ts'] }),
    },
    {
      name: 'create_pull_request',
      description: 'Create a PR with the proposed fix',
      input: z.object({ title: z.string(), body: z.string(), diff: z.string() }),
      output: z.object({ prUrl: z.string() }),
      execute: async (input) => ({ prUrl: 'https://github.com/...' }),
    },
  ],
  costCalculators: {
    'prod-pricing': createTableCostCalculator('openai-2025', [
      { provider: 'openai.chat', model: 'gpt-4o', inputUsdPer1M: 2.50, outputUsdPer1M: 10.0, effectiveFrom: '2025-01-01' },
    ]),
  },
  workflowsPath: require.resolve('./workflows'),
});

const worker = await app.createWorker();
process.on('SIGINT', () => worker.shutdown());
await worker.run();
```

```typescript
// client.ts
import 'dotenv/config';
import { createClient } from '@durion/sdk';
import { sentryPipeline } from './workflows';

const client = await createClient();
const handle = await client.start(sentryPipeline, {
  input: {
    errorTitle: 'TypeError: Cannot read property "id" of undefined',
    stackTrace: 'at UserService.getUser (src/services/user.ts:42:15)',
  },
});
const result = await handle.result();
console.log(result);
await client.close();
```

---

*End of Durion SDK Reference. This document covers the complete public API, all three primitives (workflow, agent, graph), composability, HITL, streaming, cost tracking, observability, evaluation, React hooks, the Gateway API, CLI tooling, environment configuration, error handling, and actionable best practices for AI coding agents.*
