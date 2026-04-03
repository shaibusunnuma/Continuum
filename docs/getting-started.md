# Getting started

## Fast path: `create-durion` + `durion dev`

The recommended way to try Durion locally:

```bash
npx create-durion@latest my-app
cd my-app
npx durion dev
```

**`create-durion`** scaffolds a project (templates **`hello`**, **`agent`**, or **`blank`**), wires an LLM provider (OpenAI, Anthropic, or Google), and writes **`durion.config.ts`** plus worker / workflow stubs.

**`durion dev`** (from **`@durion/cli`**) can start the Temporal dev server, run your worker with watch, the **built-in Gateway v0** (Studio + OTLP ingestion), and **Durion Studio** in one command. Use **`durion doctor`** to check Node, Temporal CLI, and `.env`.

See [Packages](packages.md) for **`create-durion`** and **`@durion/cli`**, and the [CLI README](../packages/cli/README.md).

---

## Manual setup

This section walks through a **minimal** Durion setup without the scaffolder: one workflow, one worker, and (optionally) starting a run from code.

### Prerequisites

- **Node.js** 20+ recommended (18+ may work; see [packages/sdk/package.json](../packages/sdk/package.json) `engines`)
- A running **Temporal** dev server on `localhost:7233` by default — e.g. [Temporal CLI](https://docs.temporal.io/cli) `temporal server start-dev`, or Docker / a hosted cluster; set `TEMPORAL_ADDRESS` to match
- An API key for your LLM provider (e.g. OpenAI)

### 1. Install packages

In your app:

```bash
npm install @durion/sdk zod
npm install @ai-sdk/openai
```

Use the Vercel AI SDK provider package that matches your models (`@ai-sdk/anthropic`, `@ai-sdk/google`, etc.).

### 2. Environment

Set at least:

| Variable | Example | Purpose |
|----------|---------|---------|
| `TEMPORAL_ADDRESS` | `localhost:7233` | Temporal gRPC address |
| `TEMPORAL_NAMESPACE` | `default` | Temporal namespace |
| `TASK_QUEUE` | `my-app-queue` | Task queue shared by worker and client |
| `OPENAI_API_KEY` | (secret) | For `@ai-sdk/openai` |

See [Environment variables](environment-variables.md) for the full list.

Load `.env` in **your** process entrypoint (worker and client). The SDK reads `process.env` for Temporal defaults; it does not load an application `.env` from inside `node_modules`.

### 3. Define workflows (workflow-safe file)

Create `workflows.ts`. Imports must be limited to **`@durion/sdk/workflow`** (and `import type` as needed) so Temporal’s bundler stays happy:

```typescript
// workflows.ts
import { workflow } from '@durion/sdk/workflow';

export const hello = workflow('hello', async (ctx) => {
  const reply = await ctx.model('fast', {
    prompt: `Say hello in one short sentence. Topic: ${ctx.input.topic}`,
  });
  return {
    text: reply.result,
    costUsd: ctx.metadata.accumulatedCost,
  };
});
```

### 4. Worker entry (registers models and tools)

Create `worker.ts` (or `main.ts`). Here you use **`@durion/sdk`** (full SDK):

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
      name: 'echo',
      description: 'Echo the input string',
      input: z.object({ text: z.string() }),
      output: z.object({ text: z.string() }),
      execute: async ({ text }) => ({ text }),
    },
  ],
});

const handle = await createWorker({
  runtime,
  workflowsPath: require.resolve('./workflows'),
  taskQueue: process.env.TASK_QUEUE ?? 'durion',
});

await handle.run();
```

**ESM projects:** build workflows to JS first, then pass `workflowsPath` to the compiled bundle entry (same idea as `require.resolve`, but with your bundler’s output path).

### 5. Run the worker

```bash
node worker.js
# or: npx tsx worker.ts
```

You should see a log line that the worker started on your task queue.

### 6. Start a workflow (optional)

From another script or service that **does not** need the model registry:

```typescript
// client.ts
import 'dotenv/config';
import { createClient } from '@durion/sdk';
import { hello } from './workflows';

const client = await createClient({
  taskQueue: process.env.TASK_QUEUE ?? 'durion',
});

const run = await client.start(hello, {
  input: { topic: 'shipping updates' },
});

const result = await run.result();
console.log(result);

await client.close();
```

You only need to import the **workflow function** for type-safe `client.start(hello, …)`. The API process does not call `createRuntime` unless it also runs a worker.

### 7. Next steps

- Read [Concepts](concepts.md) for **agents**, `ctx.tool()`, and human-in-the-loop.
- Read [Why Durion?](why-durion.md) if you are comparing stacks.
- For HTTP + React, see [Gateway API v0](gateway-api-v0.md) and [Streaming](streaming.md).

### Verify against the repo

The [examples/customer-support](../examples/customer-support/) example (`run.ts` in **worker** mode) follows the same pattern (`createRuntime`, `createWorker`, Zod tools, `openai.chat`).
