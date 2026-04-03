# @durion/sdk

Durable AI workflows and autonomous agents on [Temporal](https://temporal.io/), with model calls via the [Vercel AI SDK](https://ai-sdk.dev/).

## Features

- **Durable execution** — restarts replay from the last completed step; model and tool calls run as activities.
- **Provider-agnostic** — register `LanguageModel` instances from `@ai-sdk/openai`, `@ai-sdk/google`, etc.
- **`workflow()`** — explicit steps: `ctx.model()`, `ctx.tool()`, `ctx.waitForInput()`, `ctx.run()`.
- **`agent()`** — declarative loop with tool names, `maxSteps`, optional `budgetLimit` / `delegates`.
- **Streaming** — `LocalStreamBus` or `RedisStreamBus` for token deltas outside workflow history.

## Installation

```bash
npm install @durion/sdk zod
npm install @ai-sdk/openai   # or another @ai-sdk/* provider you use
```

Temporal I/O is bundled; you normally do **not** add `@temporalio/*` unless you have an advanced use case.

## Environment

The SDK reads **`process.env`** for Temporal defaults. Typical variables:

| Variable | Role |
|----------|------|
| `TEMPORAL_ADDRESS` | gRPC frontend (default `localhost:7233`) |
| `TEMPORAL_NAMESPACE` | Namespace (default `default`) |
| `TASK_QUEUE` | Queue shared by worker and `createClient` (default `durion`) |
| `TEMPORAL_API_KEY` | Temporal Cloud API key (optional). When set, TLS is enabled by default. Do not log. |
| `TEMPORAL_TLS` | Optional override: `true` / `1` force TLS; `false` / `0` force plaintext (local). Unset: TLS on if `TEMPORAL_API_KEY` is set. |

Import **`durionConfig`** from `@durion/sdk` for the resolved values (after the SDK’s repo-root `.env` load). You should still load `.env` in **your** app entrypoint when paths differ (e.g. custom deploys).

### Temporal Cloud

Point **`TEMPORAL_ADDRESS`** at your Cloud endpoint (e.g. `your-namespace.abc123.tmprl.cloud:7233`), set **`TEMPORAL_NAMESPACE`** to the namespace name, and set **`TEMPORAL_API_KEY`**. No code changes are required if env is set.

For mTLS, custom metadata, or a rotating API key on the **client**, pass **`connection`** to `createClient` (see `ConnectionOptions` from `@temporalio/client`, also re-exported as a type from `@durion/sdk`). For the **worker**, use **`nativeConnection`** on `createWorker` / `createApp` (`NativeConnectionOptions` — `apiKey` must be a string).

Provider API keys (e.g. `OPENAI_API_KEY`) are read by the AI SDK provider packages, not by Durion.

## Cost and pricing

Register **named cost calculators** on the runtime and reference them from **`ctx.model()`** / agent config via **`costCalculator`**.

- **`createTableCostCalculator(tableId, rows)`** — table-based USD per 1M input/output tokens; use **`EXAMPLE_PRICING_ROWS`** as a starting shape.
- Helpers: **`resolvePricingRow`**, **`pricingProviderMatches`**, **`normalizeCostCalculationResult`** for custom pricing logic.
- Model activity results can include **`costAttribution`** (which pricing line applied). **`ctx.metadata.accumulatedCost`** reflects spend when **`costUsd`** is computed.
- Agents support **`budgetLimit`** (e.g. **`maxCostUsd`**) across the tool loop.

See [docs/concepts.md](../../docs/concepts.md) (cost section) and [CHANGELOG.md](../../CHANGELOG.md).

## Usage

**1. Workflow-safe file** — only **`@durion/sdk/workflow`** (plus `import type` as needed) so Temporal’s bundler stays valid:

```typescript
// workflows.ts
import { workflow, agent, type WorkflowContext } from '@durion/sdk/workflow';

export const hello = workflow(
  'hello',
  async (ctx: WorkflowContext<{ topic: string }>) => {
    const reply = await ctx.model('fast', {
      prompt: `Say hello. Topic: ${ctx.input.topic}`,
    });
    return { text: reply.result, costUsd: ctx.metadata.accumulatedCost };
  },
);

export const supportAgent = agent('support-agent', {
  model: 'fast', // must match a key in createRuntime({ models: { ... } })
  instructions: 'You are a helpful customer support assistant.',
  tools: ['get_order_status'], // must match registered tool `name`s
  maxSteps: 10,
  budgetLimit: { maxCostUsd: 0.5 },
});
```

**2. Worker process** — full **`@durion/sdk`**: register models and tools, then run the worker:

```typescript
// worker.ts
import 'dotenv/config';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { createRuntime, createWorker } from '@durion/sdk';

const runtime = createRuntime({
  models: {
    fast: openai.chat('gpt-4o-mini'),
  },
  tools: [
    {
      name: 'get_order_status',
      description: 'Look up order status by id',
      input: z.object({ orderId: z.string() }),
      output: z.object({ status: z.string() }),
      execute: async ({ orderId }) => ({ status: `ok:${orderId}` }),
    },
  ],
});

const handle = await createWorker({
  runtime,
  workflowsPath: require.resolve('./workflows'),
  // taskQueue optional — defaults to TASK_QUEUE env or `durion` (see `durionConfig` from `@durion/sdk`)
});

await handle.run();
```

**3. Starting runs** (another script or service): `createClient()` (same default queue as the worker); import workflow functions for typed `client.start(...)`.

```typescript
import 'dotenv/config';
import { createClient } from '@durion/sdk';
import { hello } from './workflows';

const client = await createClient();
const run = await client.start(hello, { input: { topic: 'shipping' } });
console.log(await run.result());
await client.close();
```

## More documentation

- **[Getting started & concepts](https://github.com/shaibusunnuma/durion/tree/master/docs)** — guides, env vars, streaming, troubleshooting.
- **`@durion/react`** — hooks for Gateway HTTP + SSE + stream state (browser-facing apps).
