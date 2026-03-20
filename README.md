# AI Runtime

Durable workflows and agents on Temporal — you define `workflow()` and `agent()`; you never import Temporal.

## What it is

AI Runtime is an SDK for durable AI execution. You get replay-safe workflows and agents that call LLMs and tools, with cost tracking and optional observability. It is built on [Temporal](https://temporal.io/) and the [Vercel AI SDK](https://ai-sdk.dev/). You write `workflow()` and `agent()` with `ctx.model()` and `ctx.tool()`; the SDK turns them into Temporal workflows and activities so runs survive restarts and scale.

## Quick start

**1. Start Temporal** (from project root):

```bash
cd samples-server/compose && docker-compose -f docker-compose-dev.yml up -d
```

Temporal listens on `localhost:7233`. Leave it running.

**2. Environment**

```bash
cp .env.example .env
```

Set at least: `TEMPORAL_ADDRESS=localhost:7233`, `TEMPORAL_NAMESPACE=default`, `API_PORT=3000`, and `OPENAI_API_KEY` (or `GEMINI_API_KEY` for Gemini-based examples).

**3. Install and run**

```bash
npm install
cd examples && npm install
cd ..
npm run build
```

**Terminal 1** — run one example worker:

```bash
npm run worker:customer-support
```

**Terminal 2** — start the example API:

```bash
npm run api
```

**4. Test it**

Start a workflow:

```bash
curl -s -X POST http://localhost:3000/workflows/start \
  -H "Content-Type: application/json" \
  -d '{"workflowType":"customerSupport","input":{"message":"I want a refund","orderId":"ORD-123"}}'
```

Use the returned `workflowId` to get the result:

```bash
curl -s http://localhost:3000/runs/<workflowId>/result
```

More workflows and agents, and which env vars each needs, are in [examples/README.md](examples/README.md).

## Usage

Define workflows and agents in a file that Temporal will bundle (use the SDK workflow entry point only):

```ts
// workflows.ts
import { workflow, agent } from '@ai-runtime/sdk/workflow';

export const myWorkflow = workflow('myWorkflow', async (ctx) => {
  const reply = await ctx.model('fast', { prompt: ctx.input.prompt });
  return { reply: reply.result, cost: ctx.metadata.accumulatedCost };
});

export const myAgent = agent('myAgent', {
  model: 'fast',
  instructions: 'You are a helpful assistant.',
  tools: ['my_tool'],
  maxSteps: 8,
});
```

In your worker entry, register models and tools with `createRuntime`, then create the worker:

```ts
// worker.ts
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { createRuntime, createWorker } from '@ai-runtime/sdk';

createRuntime({
  models: { fast: openai.chat('gpt-4o-mini') },
  tools: [
    {
      name: 'my_tool',
      description: 'Does something useful',
      input: z.object({ q: z.string() }),
      output: z.object({ answer: z.string() }),
      execute: async ({ q }) => ({ answer: `Result for ${q}` }),
    },
  ],
});

const handle = await createWorker({
  workflowsPath: require.resolve('./workflows'),
  taskQueue: 'my-queue',
});
await handle.run();
```

Workflows and agents are Temporal workflows; activities run your model and tool calls. Each `ctx.model()` and `ctx.tool()` is durable — if the worker stops, the run resumes from the last step.

## Composability

Workflows and agents can call each other via `ctx.run()`. It executes a child workflow on the same task queue and returns its result directly.

```ts
// workflows.ts
import { workflow, agent } from '@ai-runtime/sdk/workflow';

export const researcher = agent('researcher', {
  model: 'fast',
  instructions: 'You research topics thoroughly.',
  tools: ['web_search'],
});

export const summarizer = workflow('summarizer', async (ctx) => {
  const result = await ctx.model('fast', { prompt: `Summarize: ${ctx.input.text}` });
  return { summary: result.result };
});

// Parent workflow calling both
export const pipeline = workflow('pipeline', async (ctx) => {
  const research = await ctx.run(researcher, { message: ctx.input.topic });
  const summary = await ctx.run(summarizer, { text: research.reply });
  return summary;
});
```

Agents can also delegate to other agents or workflows as tools using `delegates`:

```ts
export const orchestrator = agent('orchestrator', {
  model: 'reasoning',
  instructions: 'You coordinate research and summarization.',
  tools: ['format_output'],
  delegates: [
    { name: 'research', description: 'Deep research on a topic', fn: researcher },
  ],
});
```

When the model calls the `research` tool, the SDK executes `researcher` as a child workflow and returns the result to the model's tool loop.

## What's in the repo

| Path | Description |
|------|-------------|
| `packages/sdk` | Core SDK: `workflow()`, `agent()`, `createRuntime()`, `createWorker()`, `createClient()` |
| `packages/eval` | Optional evaluation plugin (capture runs, datasets, metrics) |
| `example-server/` | Reference REST API to start workflows/agents and poll results |
| `examples/` | Per-example workers and workflows (ReAct, multi-agent, etc.); see [examples/README.md](examples/README.md) |

## Requirements

- **Node.js** 18+
- **Docker** (for Temporal)

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Build all packages |
| `npm run api` | Start the example API server |
| `npm run api:dev` | Start the API with ts-node |
| `npm run worker:<name>` | Run an example worker — see [examples/README.md](examples/README.md) for names |
| `npm run test` | Run SDK tests |
| `npm run eval:build-dataset` | Build evaluation dataset (optional) |
| `npm run eval:run` | Run evaluation metrics (optional) |

## Observability and evaluation

Enable tracing and metrics by passing `true` or `false` when you call `initObservability()` in your worker or server. The SDK emits `ai.run_model` and `ai.run_tool` spans (OTLP) and metrics such as `ai_model_calls_total`, `ai_model_tokens_total`, and `ai_model_cost_usd_total` (default port 9464). You can send traces to any OTLP-compatible backend (e.g. Jaeger) and scrape metrics with Prometheus and visualize with Grafana if you like; see `docker-compose.metrics.yml` for an optional stack.

```ts
// worker.ts — enable tracing and metrics in code
import { initObservability } from '@ai-runtime/sdk';

initObservability({
  tracing: { enabled: true },
  metrics: { enabled: true },
});
// ... then createRuntime, createWorker, etc.
```

For evaluation, call `initEvaluation({ enabled: true, dbUrl: '...' })` when you want to capture runs (and ensure Postgres and the eval schema are in place). Use `enabled: false` or omit the call otherwise. See `scripts/` and `packages/eval` for dataset build and run.

```ts
// worker.ts — optional evaluation (capture runs for datasets and metrics)
import { initEvaluation } from '@ai-runtime/eval';

initEvaluation({
  enabled: true,
  dbUrl: process.env.AI_RUNTIME_EVAL_DB_URL,
  defaultVariantName: 'baseline',
});

// ... rest of worker setup
```

## Status

Early-stage. APIs and internals may change.

## Contributing

Contributions are welcome. This project is under the [MIT License](LICENSE).
