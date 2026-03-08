# SDK Design: AI Application Runtime

## 1. Design thesis

The SDK is the product. Infrastructure is a means to an end. The developer surface — what people write, read, and debug — determines whether this company succeeds or fails.

**Core principle:** Developers think in **agents**, **models**, and **tools**. They never encounter workflows, activities, task queues, signals, or event histories. Those are implementation details of the runtime, not concepts the developer manages.

**The abstraction test:** If a developer needs to import anything from `@temporalio/*` to build an AI application with our SDK, the design has failed.

---

## 2. Primary abstractions

The SDK provides two execution primitives and three resource types.

### 2.1 Execution primitives

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
**What actually happens:** This compiles to a Temporal workflow. `ctx.model()` and `ctx.tool()` schedule Temporal activities via `proxyActivities`. The developer never knows.

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
**What actually happens:** The runtime generates a Temporal workflow containing an agentic loop. Each iteration: (1) call the model with conversation history + tool schemas, (2) if the model returns tool calls, execute them as activities, (3) feed results back, (4) repeat until the model returns a final answer or `maxSteps` / `budgetLimit` is reached. State persists durably at every step.

### 2.2 When to use which

| Use case | Primitive | Why |
|----------|-----------|-----|
| Deterministic pipeline (ETL, RAG) | `workflow()` | Developer controls every step and branch |
| Autonomous agent (support, research) | `agent()` | Model decides which tools to call and when |
| Multi-step with human approval | `workflow()` with `ctx.waitForInput()` | Developer controls where to pause |
| Exploratory task (coding, analysis) | `agent()` with budget limits | Model explores; runtime caps cost/steps |

---

## 3. Resource types

### 3.1 Models

A model is a named reference to an LLM provider + model. Models are registered in a config file or programmatically.

```ts
import { defineModels } from '@ai-runtime/sdk';

defineModels({
  classifier: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0,
  },
  responder: {
    provider: 'anthropic',
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

**Provider abstraction:** Adding a new provider (e.g. Google, Mistral, local) means implementing one adapter interface (see §5). The developer never touches provider-specific code in their workflow/agent.

**Cost tracking is built in:** Every model call returns usage data. The model activity automatically records tokens (prompt + completion) and cost (computed from a price table or provider response). This is not a Phase 3 feature — it ships with the first model call.

```ts
const result = await ctx.model('classifier', { prompt: '...' });
// result.result   → the model output (string or structured)
// result.usage    → { promptTokens: 42, completionTokens: 18, totalTokens: 60, costUsd: 0.0003 }
```

### 3.2 Tools

A tool is a named, typed async function that performs external work.

```ts
import { defineTool } from '@ai-runtime/sdk';

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

**Schema generation:** The SDK auto-generates JSON Schema from Zod definitions. For agents, the schema is passed to the model so it knows what tools are available and how to call them.

**Tools are activities:** Under the hood, each tool becomes a Temporal activity. But the developer registers tools with `defineTool()`, not with Temporal's activity registration. The mapping is handled by the runtime.

### 3.3 Providers

A provider adapter handles the specifics of calling a particular LLM API.

```ts
interface ModelProvider {
  id: string;
  call(params: ModelCallParams): Promise<ModelCallResult>;
}

interface ModelCallParams {
  model: string;
  messages: Message[];
  tools?: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}

interface ModelCallResult {
  content: string;
  toolCalls?: ToolCall[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
  };
  raw: unknown;  // provider-specific raw response for debugging
}
```

Built-in providers for Phase 2: OpenAI, Anthropic. Adding a provider is implementing `ModelProvider`. The registry maps provider ids to adapter instances.

---

## 4. The context object (`ctx`)

The workflow context is the developer's primary interface. It provides access to all runtime capabilities without exposing infrastructure.

```ts
interface WorkflowContext<TInput = unknown> {
  // The input passed when the workflow was started
  input: TInput;

  // Call a model by registered name
  model(modelId: string, params: {
    prompt?: string;
    messages?: Message[];
    tools?: string[];        // tool names to make available
    responseFormat?: 'text' | 'json';
  }): Promise<ModelResult>;

  // Call a tool by registered name
  tool<T = unknown>(toolName: string, input: unknown): Promise<ToolResult<T>>;

  // Pause and wait for external input (human-in-the-loop)
  waitForInput<T = unknown>(description: string): Promise<T>;

  // Log a structured event (for observability and evaluation capture)
  log(event: string, data?: unknown): void;

  // Access the current run metadata
  run: {
    id: string;
    workflowName: string;
    startedAt: Date;
    accumulatedCost: number;
  };
}
```

**What `ctx.model()` does internally:**
1. Looks up the model id in the model registry → gets provider + model config.
2. Schedules a `runModel` Temporal activity with the provider, model, messages, and tool schemas.
3. The activity calls the provider adapter, captures the response and usage.
4. Returns `{ result, usage }` to the workflow.

**What `ctx.tool()` does internally:**
1. Looks up the tool name in the tool registry → gets the activity name.
2. Schedules a `runTool` Temporal activity with the tool name and input.
3. The activity runs the tool's `execute` function.
4. Returns the typed result.

**What `ctx.waitForInput()` does internally:**
1. Issues a Temporal signal wait. The workflow pauses durably.
2. When an external call sends a signal (via the Runtime API), the workflow resumes with the provided data.

---

## 5. Agent loop architecture

The agent primitive is the most complex part of the SDK. Here is how it works internally.

### 5.1 Lifecycle

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
│  Call model with conversation   │◄──────────────────┐
│  history + available tools      │                    │
└────────────────┬────────────────┘                    │
                 │                                     │
         ┌───────┴───────┐                             │
         │               │                             │
    Final answer    Tool call(s)                       │
         │               │                             │
         ▼               ▼                             │
┌──────────────┐  ┌──────────────────┐                 │
│  Return      │  │  Execute tools   │                 │
│  result      │  │  (as activities) │                 │
└──────────────┘  └────────┬─────────┘                 │
                           │                           │
                           ▼                           │
                  ┌──────────────────┐                 │
                  │  Append tool     │                 │
                  │  results to      │─────────────────┘
                  │  conversation    │
                  └──────────────────┘
```

### 5.2 Durability guarantees

Each iteration of the loop is a Temporal activity (or set of activities). If the worker crashes:

- **Mid-model-call:** The model activity retries. The conversation history up to that point is already in Temporal's event history.
- **Mid-tool-execution:** The tool activity retries. Prior model outputs and tool results are preserved.
- **Between iterations:** The workflow replays from event history. All previous iterations' results are reconstructed.

The developer gets all of this without writing any retry or state persistence code.

### 5.3 Budget and step limits

Agents can run indefinitely, which is dangerous. The runtime enforces limits:

- `maxSteps`: maximum number of model calls. Default: 10.
- `budgetLimit.maxCostUsd`: maximum accumulated cost. The runtime checks after each model call and terminates gracefully if exceeded.
- `budgetLimit.maxTokens`: maximum total tokens (optional).

When a limit is hit, the agent returns a structured result indicating it was capped, with the conversation history and accumulated cost.

### 5.4 Agent as Temporal workflow

Under the hood, `agent()` generates a Temporal workflow function:

```
agent("support-agent", config)

  →  Temporal workflow "agent:support-agent"
       iteration 1: runModel activity → check for tool calls
       iteration 2: runTool activities → runModel activity → check
       ...
       final: return result

  →  Activities registered: runModel, runTool (generic, reusable)
```

The developer never sees this. They define the agent declaratively and start it via the Runtime API.

---

## 6. How Temporal is hidden

This is the design's most important property. Here is the mapping:

| Developer concept | Temporal concept (hidden) |
|-------------------|---------------------------|
| `workflow("name", fn)` | Temporal workflow function registered by name |
| `agent("name", config)` | Temporal workflow function (generated) with agentic loop |
| `ctx.model("id", params)` | `proxyActivities` → `runModel` activity |
| `ctx.tool("name", input)` | `proxyActivities` → `runTool` activity |
| `ctx.waitForInput()` | Temporal signal (workflow waits for signal) |
| Starting a workflow/agent | Runtime API → Temporal client → `workflow.start()` |
| Getting a result | Runtime API → Temporal client → `handle.result()` |
| Run ID | Temporal workflow execution ID (exposed as `run.id`) |
| Cost tracking | Metadata returned from `runModel` activity; accumulated in workflow state |
| Event history | Temporal event history (accessed via Runtime API for observability, never by developer) |

**Import boundary:** The SDK package (`@ai-runtime/sdk`) re-exports everything the developer needs. It internally depends on `@temporalio/workflow` and `@temporalio/activity`, but these are never exposed in the public API surface. The developer's `tsconfig` and code never reference `@temporalio/*`.

**Worker setup:** The developer runs our worker binary (or calls our `createWorker()` function), which internally creates a Temporal worker with all the right registrations. They don't configure task queues, workflow paths, or activity registrations.

```ts
import { createWorker } from '@ai-runtime/sdk';

// one function, zero Temporal concepts
await createWorker({
  models: './models.ts',    // or inline defineModels
  tools: ['./tools/*.ts'],  // glob of tool definitions
});
```

---

## 7. Runtime API extensions for Phase 2

The Fastify API from Phase 1 gets new endpoints:

| Endpoint | Purpose |
|----------|---------|
| `POST /workflows/start` | Start a workflow by name (exists from Phase 1, extended) |
| `POST /agents/start` | Start an agent by name with initial input |
| `POST /runs/:runId/input` | Send input to a paused workflow (human-in-the-loop, maps to Temporal signal) |
| `GET /runs/:runId` | Get run status, accumulated cost, step count |
| `GET /runs/:runId/result` | Get final result (blocks or returns pending) |
| `GET /runs/:runId/history` | Get execution history (model calls, tool calls, costs) for observability |

---

## 8. Type safety strategy

Everything is typed end-to-end:

- **Workflow input/output:** Generic type parameters on `workflow<TInput, TOutput>(...)`.
- **Tool input/output:** Zod schemas infer TypeScript types. `ctx.tool()` returns the typed output.
- **Model output:** String by default; structured output with Zod schema for JSON mode.
- **Agent input/output:** Input is typed; output is the model's final response (string or structured).

```ts
const support = workflow<SupportInput, SupportOutput>('support', async (ctx) => {
  // ctx.input is typed as SupportInput
  const order = await ctx.tool<Order>('get-order', { orderId: ctx.input.orderId });
  // order.result is typed as Order
  return { action: 'refund', orderId: order.result.id };
  // return type checked against SupportOutput
});
```

---

## 9. SDK package structure

```
@ai-runtime/sdk
├── workflow()          — define a workflow
├── agent()             — define an agent
├── defineModels()      — register model configurations
├── defineTool()        — register a tool
├── createWorker()      — start a worker (hides Temporal)
├── createClient()      — start a client to trigger runs programmatically
└── types/
    ├── WorkflowContext
    ├── ModelResult
    ├── ToolResult
    ├── Message
    ├── ToolSchema
    └── ModelProvider
```

Internal (not exported to developer):
```
@ai-runtime/sdk/internal
├── temporal/
│   ├── workflow-adapter.ts    — maps workflow() to Temporal workflow
│   ├── agent-workflow.ts      — generates Temporal workflow for agent loop
│   ├── activities.ts          — runModel, runTool activity implementations
│   └── worker-factory.ts      — creates Temporal worker with registrations
├── providers/
│   ├── openai.ts              — OpenAI ModelProvider adapter
│   ├── anthropic.ts           — Anthropic ModelProvider adapter
│   └── registry.ts            — maps provider ids to adapters
├── tools/
│   └── registry.ts            — maps tool names to execute functions + schemas
└── cost/
    └── tracker.ts             — token counting, price lookup, cost computation
```

---

## 10. Cost tracking architecture

Cost tracking is not an observability feature — it is a core primitive.

### 10.1 Where cost is captured

The `runModel` activity captures usage from the provider response:

```
Developer calls ctx.model("classifier", { prompt: "..." })
  → runModel activity executes
    → provider.call({ model: "gpt-4o-mini", messages: [...] })
    → provider returns { content, usage: { promptTokens, completionTokens } }
    → activity computes cost: tokens × price_per_token (from price table)
    → activity returns { result: content, usage: { promptTokens, completionTokens, totalTokens, costUsd } }
  → workflow accumulates cost in ctx.run.accumulatedCost
```

### 10.2 Price table

A static table (updatable) mapping `(provider, model)` → `(input_price_per_1k, output_price_per_1k)`. For providers that return cost directly (some do), use that. For others, compute from tokens × price.

### 10.3 Budget enforcement

In agent loops: after each model call, check `accumulatedCost` against `budgetLimit.maxCostUsd`. If exceeded, terminate gracefully.

In workflows: `ctx.run.accumulatedCost` is available for the developer to check and branch on.

---

## 11. Competitive differentiation summary

| Feature | Our SDK | Temporal raw | Runboard | inference.sh | Kruxia Flow |
|---------|---------|-------------|----------|-------------|-------------|
| TypeScript-first | Yes | Yes (TS SDK) | No (Python) | No | No (Python) |
| Zero Temporal concepts in developer code | Yes | No | No | N/A | N/A |
| Declarative agent primitive | Yes | No | Partial | Yes | No |
| Explicit workflow primitive | Yes | Yes | Yes | No | Yes |
| Both (hybrid) | Yes | No | No | No | No |
| Built-in cost tracking | Yes | No | Partial | No | Yes |
| Provider-agnostic | Yes | Yes | Yes | Unclear | Yes |
| Budget limits | Yes | No | No | No | Yes |
| Open-source runtime | Planned | Yes (server) | Unclear | No | Yes (AGPL) |
| Typed tool registration (Zod) | Yes | No | No | No | No |

---

## 12. Open design questions (to resolve during Phase 1.5 review)

1. **Streaming:** Should `ctx.model()` support streaming responses? If yes, how does that interact with Temporal's activity model (activities return a single result)? Possible: stream via a sidecar or activity heartbeats. Defer to Phase 3?

2. **Multi-agent handoffs:** Should agents be able to hand off to other agents (like OpenAI's handoff pattern)? If yes, this is a child workflow under the hood. Define the API surface.

3. **Conversation memory:** For agents, where does conversation history live? In the workflow state (simple but grows event history) or in an external store (more scalable but adds complexity)?

4. **Structured output:** Should `ctx.model()` support Zod schemas for structured JSON output? (Likely yes — the provider adapter would pass the schema as a response format constraint.)

5. **Package naming:** `@ai-runtime/sdk` is a placeholder. The final package name should match the company/product name.

6. **CLI:** Should there be a CLI for scaffolding projects, running workers, and deploying? (Likely yes for Phase 3+, not Phase 2.)
