# Running a client in another app or repo

Workers and demos in this folder often live in the **same** `run.ts` so you see worker + `createClient` in one place. In production you usually split them:

- **Process A:** worker only (polls Temporal, runs workflows).
- **Process B:** API, CLI, or job runner that calls **`createClient`** and starts workflows.

They only need to agree on:

| Setting | How |
|--------|-----|
| **Temporal address** | Same `TEMPORAL_ADDRESS` (and gRPC TLS if used). |
| **Namespace** | Same `TEMPORAL_NAMESPACE` (default is often fine). |
| **Task queue** | Same string passed to the worker **and** to `createClient({ taskQueue: '...' })`. |

Example minimal client (copy into your other service; add `@ai-runtime/sdk`, `@temporalio/client`, env, and your workflow import or type):

```typescript
import { createClient } from '@ai-runtime/sdk';
import { myWorkflow } from './workflows'; // or register types your way

const TASK_QUEUE = 'my-queue'; // must match the worker

async function main() {
  const client = await createClient({ taskQueue: TASK_QUEUE });
  try {
    const handle = await client.start(myWorkflow, { input: { message: 'hi' } });
    console.log(await handle.result());
  } finally {
    await client.close();
  }
}
```

You do **not** need `createApp`, `createWorker`, or workflow bundle registration on the client process—only the worker registers workflows with Temporal.

See also: [examples/README.md](README.md) and per-example `run.ts` files for full demos.
