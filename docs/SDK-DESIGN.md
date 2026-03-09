# SDK Design: AI Application Runtime

## 1. Design thesis

The SDK is the product. Infrastructure is a means to an end. The developer surface — what people write, read, and debug — determines whether this company succeeds or fails.

**Core principle:** Developers think in **agents**, **models**, and **tools**. They never encounter workflows, activities, task queues, signals, or event histories. Those are implementation details of the runtime, not concepts the developer manages.

**The abstraction test:** If a developer needs to import anything from `@temporalio/*` or `ai` (Vercel AI SDK) to build an AI application with our SDK, the design has failed. They use our API; we use those libraries internally.

---

## 2. Build vs reuse: what we build, what we leverage

This is the most important engineering decision for velocity. We should **build only what differentiates us** and reuse proven libraries for everything else.

### 2.1 Summary table

| Capability | Build or reuse? | Library / tool | Why |
|------------|----------------|----------------|-----|
| **Durable execution** | Reuse | **Temporal** (`@temporalio/*`) | Proven at scale (OpenAI, Replit). Years of work we skip. |
| **LLM calling** | Reuse | **Vercel AI SDK** (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`) | Provider-agnostic `generateText()` with tool calling, token usage, structured output. 20+ providers already built. |
| **Provider adapters** | Reuse | **Vercel AI SDK provider packages** | OpenAI, Anthropic, Google, Mistral, etc. already implemented. No reason to write our own HTTP clients for each provider. |
| **Tool schema (Zod → JSON)** | Reuse | **Zod** + Vercel AI SDK's built-in `tool()` | AI SDK already converts Zod schemas to JSON Schema for function calling. Zod v4 has native JSON schema generation. |
| **Agentic loop (model ↔ tools)** | Reuse (partially) | **Vercel AI SDK** `generateText` with `stopWhen` / `maxSteps` | AI SDK already implements the model-calls-tools-loops pattern. We wrap it in a Temporal activity for durability. |
| **Token usage data** | Reuse | **Vercel AI SDK** `result.usage` / `result.totalUsage` | `generateText()` returns `{ promptTokens, completionTokens }` per step and total. We just read what it gives us. |
| **Cost calculation (USD)** | Reuse | **`token-costs`** npm package | Daily-updated pricing for OpenAI, Anthropic, Google, OpenRouter. `calculateCost(model, inputTokens, outputTokens)`. No need to maintain our own price table. |
| **Observability / tracing** | Reuse | **OpenTelemetry** (`@opentelemetry/*`) + **GenAI semantic conventions** | Standard `gen_ai.*` attributes for LLM spans. Supported by Datadog, Honeycomb, New Relic. We emit spans; users choose their backend. |
| **Temporal ↔ AI SDK bridge** | Evaluate | **`@temporalio/ai-sdk`** plugin (public preview) | Official plugin that wraps `generateText()` as Temporal activities. We may use it internally OR build our own thin wrapper if we need more control (e.g. cost tracking per call). |
| **Workflow abstraction** | **Build** | — | `workflow()` function that hides Temporal workflow registration, `proxyActivities`, and sandbox constraints behind our API. This is our product. |
| **Agent abstraction** | **Build** | — | `agent()` that generates a durable Temporal workflow with AI SDK's agentic loop inside activities. The "durable agent" primitive is our differentiator. |
| **ctx object** | **Build** | — | `ctx.model()`, `ctx.tool()`, `ctx.waitForInput()`, `ctx.run` — our developer surface. Maps to Temporal + AI SDK calls internally. |
| **Budget enforcement** | **Build** | — | Per-run cost limits checked after each model call. Uses cost data from token-costs + AI SDK usage. No existing library does this. |
| **Worker setup** | **Build** | — | `createWorker()` that hides Temporal worker creation, activity registration, and workflow bundling. |
| **Runtime API** | **Build** | — | Fastify endpoints for starting workflows/agents, sending signals, querying status/results/history. |
| **Tool registry** | **Build** | — | `defineTool()` → maps tool names to Temporal activities + generates AI SDK tool schemas for agents. |
| **Model registry** | **Build** | — | `defineModels()` → maps model ids to AI SDK provider instances + model config. |

### 2.2 What this means in practice

**We do not write HTTP clients for OpenAI or Anthropic.** The Vercel AI SDK does that, supports streaming, handles retries at the HTTP level, and already has 20+ provider packages. We call `generateText()` inside our `runModel` activity.

**We do not write our own agentic loop from scratch.** The Vercel AI SDK's `generateText()` with `maxSteps` already implements the "model calls tools, results fed back, repeat" pattern. We wrap that in a Temporal activity so it becomes durable (crash-safe, resumable).

**We do not write our own price table.** The `token-costs` package maintains daily-updated pricing for all major models. We call `calculateCost()` with the usage data from AI SDK.

**We do not write our own tracing format.** OpenTelemetry GenAI semantic conventions (`gen_ai.usage.input_tokens`, `gen_ai.request.model`, etc.) are the standard. We emit spans with these attributes.

**What we build is the glue and the abstraction:** the developer surface (`workflow()`, `agent()`, `ctx`, `defineTool()`, `defineModels()`), the Temporal integration (hiding it completely), the budget enforcement, and the Runtime API.

### 2.3 How this differs from using Vercel AI SDK directly

| | Vercel AI SDK (direct) | Our SDK (wrapping AI SDK + Temporal) |
|---|---|---|
| **Where code runs** | In your process (Next.js route, serverless function) | In durable Temporal workers |
| **If the process crashes** | Run is lost | Run replays from last completed step |
| **Long-running agent (10 min+)** | Serverless timeout kills it | Runs for hours/days, durable |
| **Cost tracking** | `result.usage` gives tokens; no USD, no budget | USD cost per call + accumulated per run + budget limits |
| **Observability** | You add it yourself | Built into every model/tool call (OTel spans) |
| **Tool execution** | In-process, no retry/durability | Each tool call is a retried, durable Temporal activity |
| **Human-in-the-loop** | You build it yourself | `ctx.waitForInput()` — workflow pauses durably |

**In short:** Vercel AI SDK is the best library for "call an LLM." We use it. But we add the execution runtime around it — durability, cost control, observability, and a higher-level developer surface.

### 2.4 The `@temporalio/ai-sdk` plugin question

Temporal has released an official plugin that wraps Vercel AI SDK calls as activities. We should evaluate it:

**Use it if:** It gives us clean activity wrapping, handles the AI SDK sandbox constraints in Temporal workflows, and we can still intercept the result to add cost tracking and tracing.

**Build our own thin wrapper if:** The plugin doesn't expose the `usage` data we need, or it couples us to patterns that conflict with our `ctx.model()` abstraction.

**Decision:** Start with the plugin during prototyping; replace with our own wrapper if needed. Either way, the developer never sees it.

---

## 3. Primary abstractions

The SDK provides two execution primitives and three resource types.

### 3.1 Execution primitives

#### Workflow (explicit control flow)

The developer writes a function that orchestrates model calls, tool calls, and logic in a deterministic sequence. They control every step.

```ts
import { workflow } from '@ai-runtime/sdk';

const support = workflow('customer-support', async (ctx) => {
  const intent = await ctx.model('classifier', {
    prompt: `Classify this request: ${ctx.input.message}`,
  });

  if (intent.result === 'refund') {
    const order = await ctx.tool('get-order', { orderId: ctx.input.orderId });
    const response = await ctx.model('responder', {
      prompt: `Write a refund response for order ${order.result.id}`,
    });
    return { action: 'refund', response: response.result };
  }

  const response = await ctx.model('responder', {
    prompt: `Help with: ${ctx.input.message}`,
  });
  return { action: 'general', response: response.result };
});
```

**What the developer sees:** A typed async function with `ctx.model()` and `ctx.tool()`.
**What actually happens:** This compiles to a Temporal workflow. `ctx.model()` and `ctx.tool()` schedule Temporal activities that internally call Vercel AI SDK's `generateText()` and the tool's `execute` function. The developer never imports from either library.

#### Agent (autonomous durable loop)

The developer defines an agent by declaring its capabilities. The runtime manages the observe-reason-act loop durably.

```ts
import { agent } from '@ai-runtime/sdk';

const supportAgent = agent('support-agent', {
  model: 'gpt-4o',
  instructions: `You are a customer support agent. Help users with orders,
    refunds, and general questions. Use tools to look up information.`,
  tools: ['get-order', 'search-kb', 'send-email'],
  maxSteps: 15,
  budgetLimit: { maxCostUsd: 0.50 },
});
```

**What the developer sees:** A declarative agent definition.
**What actually happens:** The runtime generates a Temporal workflow. Inside it, a `runAgentLoop` activity calls Vercel AI SDK's `generateText()` with tools and `maxSteps`. But unlike calling AI SDK directly, every tool execution is a **separate durable activity** (crash-safe, retried). Between model iterations, the workflow state is checkpointed by Temporal. If the worker crashes, the workflow replays from the last completed step.

### 3.2 When to use which

| Use case | Primitive | Why |
|----------|-----------|-----|
| Deterministic pipeline (ETL, RAG) | `workflow()` | Developer controls every step and branch |
| Autonomous agent (support, research) | `agent()` | Model decides which tools to call and when |
| Multi-step with human approval | `workflow()` with `ctx.waitForInput()` | Developer controls where to pause |
| Exploratory task (coding, analysis) | `agent()` with budget limits | Model explores; runtime caps cost/steps |

---

## 4. Resource types

### 4.1 Models

A model is a named reference to an LLM. Internally, each model maps to a **Vercel AI SDK provider instance + model name**.

```ts
import { defineModels } from '@ai-runtime/sdk';

defineModels({
  classifier: {
    provider: 'openai',       // maps to @ai-sdk/openai
    model: 'gpt-4o-mini',
    temperature: 0,
  },
  responder: {
    provider: 'anthropic',    // maps to @ai-sdk/anthropic
    model: 'claude-sonnet-4-20250514',
    temperature: 0.7,
    maxTokens: 1024,
  },
  'gpt-4o': {
    provider: 'openai',
    model: 'gpt-4o',
  },
});
```

**Under the hood:** `defineModels()` creates Vercel AI SDK provider instances (e.g. `openai('gpt-4o-mini')`) and stores them in a registry keyed by model id. When `ctx.model('classifier', ...)` is called, the `runModel` activity looks up the AI SDK model instance, calls `generateText()`, extracts usage, computes cost via `token-costs`, and returns the result.

**Cost tracking flow:**
```
ctx.model('classifier', { prompt: '...' })
  → runModel activity
    → ai.generateText({ model: openai('gpt-4o-mini'), ... })
    → result.usage = { promptTokens: 42, completionTokens: 18 }
    → token-costs: calculateCost('gpt-4o-mini', 42, 18) → $0.0003
    → return { result: text, usage: { promptTokens, completionTokens, totalTokens, costUsd } }
```

**Adding a new provider:** Install the AI SDK provider package (e.g. `@ai-sdk/google`) and use `provider: 'google'` in `defineModels()`. No adapter code to write — AI SDK already has 20+ providers.

### 4.2 Tools

A tool is a named, typed async function. We use **Zod** for schemas (same as Vercel AI SDK and OpenAI Agents SDK).

```ts
import { defineTool } from '@ai-runtime/sdk';
import { z } from 'zod';

const getOrder = defineTool('get-order', {
  description: 'Look up an order by ID',
  input: z.object({ orderId: z.string() }),
  output: z.object({ id: z.string(), status: z.string(), total: z.number() }),
  execute: async (input) => {
    const order = await db.orders.findById(input.orderId);
    return { id: order.id, status: order.status, total: order.total };
  },
});
```

**Under the hood:** `defineTool()` registers the tool in our tool registry. When used in an agent, the Zod input schema is converted to JSON Schema (using Zod's native conversion or `zod-to-json-schema`) and passed to AI SDK's `generateText()` as a tool definition. When used via `ctx.tool()`, the `runTool` activity executes the tool's `execute` function.

**Tools are activities:** Each tool becomes a Temporal activity. This means tool execution gets retries, timeouts, and durability from Temporal.

### 4.3 Providers (we do NOT build these)

We do **not** implement our own provider adapters. The Vercel AI SDK provider packages handle all LLM-specific HTTP calls, auth, streaming, and response parsing:

- `@ai-sdk/openai` — OpenAI, Azure OpenAI
- `@ai-sdk/anthropic` — Anthropic
- `@ai-sdk/google` — Google Gemini
- `@ai-sdk/mistral` — Mistral
- 20+ more community providers

Our model registry maps `provider: 'openai'` → the AI SDK `openai` provider function. Adding a provider is `npm install @ai-sdk/google` and updating the model config. Zero adapter code.

---

## 5. The context object (`ctx`)

The workflow context is the developer's primary interface.

```ts
interface WorkflowContext<TInput = unknown> {
  input: TInput;

  model(modelId: string, params: {
    prompt?: string;
    messages?: Message[];
    tools?: string[];
    responseFormat?: 'text' | 'json';
  }): Promise<ModelResult>;

  tool<T = unknown>(toolName: string, input: unknown): Promise<ToolResult<T>>;

  waitForInput<T = unknown>(description: string): Promise<T>;

  log(event: string, data?: unknown): void;

  run: {
    id: string;
    workflowName: string;
    startedAt: Date;
    accumulatedCost: number;
  };
}
```

**What `ctx.model()` does internally:**
1. Looks up model id in registry → gets AI SDK provider instance + config.
2. Schedules a `runModel` Temporal activity.
3. Activity calls `generateText()` from Vercel AI SDK with the provider instance.
4. Reads `result.usage` (promptTokens, completionTokens) from AI SDK.
5. Calls `calculateCost()` from `token-costs` to get USD.
6. Emits an OpenTelemetry span with `gen_ai.*` attributes.
7. Returns `{ result, usage }` to the workflow.

**What `ctx.tool()` does internally:**
1. Looks up tool name in registry → gets activity name + execute function.
2. Schedules a `runTool` Temporal activity.
3. Activity validates input against Zod schema, runs `execute()`.
4. Returns typed result.

**What `ctx.waitForInput()` does internally:**
1. Issues a Temporal signal wait. Workflow pauses durably.
2. When external call sends signal (via Runtime API), workflow resumes.

---

## 6. Agent loop architecture

### 6.1 Lifecycle

```
Start
  │
  ▼
┌─────────────────────────────────┐
│  Initialize conversation        │
│  (system prompt + user input)   │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│  Call model (AI SDK             │◄──────────────────┐
│  generateText with tools)       │                    │
└────────────────┬────────────────┘                    │
                 │                                     │
         ┌───────┴───────┐                             │
         │               │                             │
    Final answer    Tool call(s)                       │
         │               │                             │
         ▼               ▼                             │
┌──────────────┐  ┌──────────────────┐                 │
│  Return      │  │  Execute tools   │                 │
│  result      │  │  (as Temporal    │                 │
│  + cost      │  │  activities)     │                 │
└──────────────┘  └────────┬─────────┘                 │
                           │                           │
                           ▼                           │
                  ┌──────────────────┐                 │
                  │  Append results  │                 │
                  │  + check budget  │─────────────────┘
                  │  + check steps   │
                  └──────────────────┘
```

### 6.2 Durability: what AI SDK alone cannot do

The key difference from using AI SDK directly: each **tool execution** is a separate Temporal activity. If the worker crashes mid-agent:

- **Mid-model-call:** The model activity retries. Prior conversation state is in Temporal event history.
- **Mid-tool-execution:** The tool activity retries from the beginning of that tool call. All prior model outputs and tool results are preserved.
- **Between iterations:** Temporal replays the workflow. All previous steps reconstruct from event history.

AI SDK's `maxSteps` runs the entire loop in a single process. If that process dies, everything is lost. Our agent runs each iteration as a durable step.

### 6.3 Budget and step limits

- `maxSteps`: maximum model call iterations. Default: 10.
- `budgetLimit.maxCostUsd`: maximum accumulated USD cost. Checked after each model call using data from AI SDK's `result.usage` + `token-costs`. Terminates gracefully if exceeded.
- `budgetLimit.maxTokens`: maximum total tokens (optional).

### 6.4 Agent as Temporal workflow

```
agent("support-agent", config)

  →  Temporal workflow "agent:support-agent"
       step 1: runModel activity (AI SDK generateText) → model returns tool calls
       step 2: runTool activity (get-order) → returns order data
       step 3: runModel activity (AI SDK generateText with tool results) → final answer
       done: return result + total cost

  →  Activities: runModel (uses AI SDK), runTool (uses tool registry)
```

---

## 7. How Temporal is hidden

| Developer concept | Temporal concept (hidden) | Library used internally |
|-------------------|---------------------------|------------------------|
| `workflow("name", fn)` | Temporal workflow function | `@temporalio/workflow` |
| `agent("name", config)` | Temporal workflow (generated) | `@temporalio/workflow` |
| `ctx.model("id", params)` | `proxyActivities` → `runModel` | Vercel AI SDK `generateText()` |
| `ctx.tool("name", input)` | `proxyActivities` → `runTool` | Tool's `execute()` function |
| `ctx.waitForInput()` | Temporal signal | `@temporalio/workflow` |
| Cost per model call | Activity return value | `token-costs` + AI SDK `usage` |
| Tracing per call | OTel span emission | `@opentelemetry/*` |
| Starting a run | Runtime API → Temporal client | `@temporalio/client` |

**Import boundary:** Developer imports from `@ai-runtime/sdk` only. Never from `@temporalio/*`, `ai`, `@ai-sdk/*`, `token-costs`, or `@opentelemetry/*`.

**Worker setup:**
```ts
import { createWorker } from '@ai-runtime/sdk';

await createWorker({
  models: './models.ts',
  tools: ['./tools/*.ts'],
});
```

Internally this creates a Temporal worker, bundles workflows, registers activities, and loads tool/model definitions. Developer sees one function call.

---

## 8. Runtime API extensions for Phase 2

| Endpoint | Purpose |
|----------|---------|
| `POST /workflows/start` | Start a workflow by name (extended from Phase 1) |
| `POST /agents/start` | Start an agent by name with initial input |
| `POST /runs/:runId/input` | Send input to a paused workflow (human-in-the-loop) |
| `GET /runs/:runId` | Get run status, accumulated cost, step count |
| `GET /runs/:runId/result` | Get final result (blocks or returns pending) |
| `GET /runs/:runId/history` | Get execution history (model calls, tool calls, costs) |

---

## 9. Type safety strategy

- **Workflow input/output:** `workflow<TInput, TOutput>(...)` generic parameters.
- **Tool input/output:** Zod schemas infer TypeScript types.
- **Model output:** String by default; Zod schema for structured JSON output.
- **Agent input/output:** Input is typed; output is model's final response.

```ts
const support = workflow<SupportInput, SupportOutput>('support', async (ctx) => {
  const order = await ctx.tool<Order>('get-order', { orderId: ctx.input.orderId });
  return { action: 'refund', orderId: order.result.id };
});
```

---

## 10. SDK package structure

### Public API (what developers see)
```
@ai-runtime/sdk
├── workflow()          — define a workflow
├── agent()             — define an agent
├── defineModels()      — register model configs (maps to AI SDK providers)
├── defineTool()        — register a tool (Zod schemas)
├── createWorker()      — start a worker
├── createClient()      — start a client
└── types/
    ├── WorkflowContext, ModelResult, ToolResult
    ├── Message, ToolSchema
    └── AgentConfig
```

### Internal (hidden from developers)
```
@ai-runtime/sdk/internal
├── temporal/
│   ├── workflow-adapter.ts    — maps workflow() to Temporal workflow
│   ├── agent-workflow.ts      — generates Temporal workflow for agent loop
│   ├── activities.ts          — runModel (calls AI SDK), runTool (calls tool registry)
│   └── worker-factory.ts      — creates Temporal worker
├── ai/
│   ├── model-registry.ts     — maps model ids to AI SDK provider instances
│   ├── tool-registry.ts      — maps tool names to execute fns + Zod schemas
│   └── cost.ts               — wraps token-costs for USD calculation
└── observability/
    └── tracing.ts             — emits OTel spans with gen_ai.* attributes
```

### Dependencies (internal, not developer-facing)
```
@temporalio/client, @temporalio/worker, @temporalio/workflow, @temporalio/activity
ai (Vercel AI SDK core)
@ai-sdk/openai, @ai-sdk/anthropic (provider packages)
token-costs (pricing data)
@opentelemetry/api, @opentelemetry/semantic-conventions (tracing)
zod (schemas — also a peer dep for developer tool definitions)
```

---

## 11. Cost tracking architecture

### 11.1 Data flow

```
ctx.model('classifier', { prompt: '...' })
  → runModel activity
    → AI SDK: generateText({ model: openai('gpt-4o-mini'), ... })
    → AI SDK returns: result.usage = { promptTokens: 42, completionTokens: 18 }
    → token-costs: calculateCost('gpt-4o-mini', 42, 18) → $0.0003
    → OTel: emit span with gen_ai.usage.input_tokens=42, gen_ai.usage.output_tokens=18
    → return { result, usage: { promptTokens, completionTokens, totalTokens, costUsd } }
  → workflow accumulates cost in ctx.run.accumulatedCost
```

### 11.2 Why we reuse token-costs instead of building our own

- Daily-updated pricing for OpenAI, Anthropic, Google, OpenRouter.
- `calculateCost(model, inputTokens, outputTokens)` is the exact function we need.
- Maintaining our own price table = ongoing ops burden with zero differentiation.

### 11.3 Budget enforcement

- Agent loops: check `accumulatedCost` vs `budgetLimit.maxCostUsd` after each model call.
- Workflows: `ctx.run.accumulatedCost` available for developer to branch on.

---

## 12. Competitive differentiation summary

| Feature | Our SDK | Temporal raw | Vercel AI SDK | Runboard | inference.sh | Kruxia Flow |
|---------|---------|-------------|---------------|----------|-------------|-------------|
| Durable execution | Yes (via Temporal) | Yes | No | Yes | Yes | Yes |
| TypeScript-first | Yes | Yes | Yes | No (Python) | No | No (Python) |
| Zero infra concepts in code | Yes | No | N/A (no infra) | No | Partial | No |
| Provider-agnostic LLM calls | Yes (via AI SDK) | No | Yes | Yes | Unclear | Yes |
| Declarative agent primitive | Yes | No | Yes (`ToolLoopAgent`) | Partial | Yes | No |
| Durable agent (crash-safe) | Yes | DIY | No | Yes | Yes | Yes |
| Both workflows + agents | Yes | DIY | Partial | No | No | No |
| Built-in cost tracking (USD) | Yes | No | No (tokens only) | Partial | No | Yes |
| Budget limits per run | Yes | No | No | No | No | Yes |
| Typed tools (Zod) | Yes | No | Yes | No | No | No |
| OTel tracing built-in | Yes | Partial | No | No | No | No |

---

## 13. Open design questions (to resolve during Phase 1.5 review)

1. **Streaming:** Should `ctx.model()` support streaming? AI SDK has `streamText()`, but Temporal activities return a single result. Options: (a) stream via activity heartbeats, (b) stream via a sidecar channel (e.g. Redis pub/sub or SSE from Runtime API), (c) defer to Phase 3. Recommendation: defer — most workflow/agent use cases don't need streaming; the user gets the final result.

2. **Multi-agent handoffs:** Should agents hand off to other agents? Under the hood this is a Temporal child workflow. The OpenAI Agents SDK has a "handoff" concept. Define API surface if yes.

3. **Conversation memory:** For agents, conversation history lives in workflow state (simple) or external store (scalable). Start with workflow state; move to external if event history size becomes a problem (Temporal's 50k event / 50MB limit).

4. **Structured output:** `ctx.model()` should accept a Zod schema for JSON output. AI SDK already supports this via `responseFormat` + schema. Pass through.

5. **`@temporalio/ai-sdk` plugin vs own wrapper:** Prototype with the plugin; replace with our own `runModel` activity if we need more control over cost/tracing interception.

6. **Package naming:** `@ai-runtime/sdk` is a placeholder. Final name should match company/product.

7. **CLI:** Scaffolding, worker management, deployment. Phase 3+, not Phase 2.
