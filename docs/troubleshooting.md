# Troubleshooting

## Worker runs but workflows never make progress

- **Task queue mismatch** — `createWorker({ taskQueue })` and `createClient({ taskQueue })` (or per-start override) must use the **same** queue name as the worker that hosts your workflows. Check `TASK_QUEUE` in each process.
- **Worker not running** — Only workers poll the queue; a client-only API cannot execute activities.

## `Workflow not found` / unknown workflow type

- **Workflow not registered on that worker** — `workflowsPath` must point to the bundle entry that **exports** your `workflow()` / `agent()` functions.
- **Typo in `client.startWorkflow('Name', …)`** — Prefer type-safe **`client.start(myFn, …)`** so the name matches the function export.

## `Model not found` / `Tool not registered`

- **`createRuntime`** on the worker must register every **`modelId`** and tool **name** referenced from workflows or agent config.
- **Separate processes** — The API process does **not** need models/tools unless it also runs activities; the **worker** must have the full runtime.

## Workflow bundle / import errors

- Workflow files must import from **`@durion/sdk/workflow`** only (plus `import type` as allowed). Do not import worker-only modules into the workflow file.
- **`require.resolve('./workflows')`** must resolve to the **compiled** workflow entry Temporal expects in your build layout.

## Human-in-the-loop: workflow stuck waiting

- Signal name must match **`durion:user-input`** unless you pass a custom name consistently on both sides.
- Use the gateway **`POST .../signal`** or Temporal client **`handle.signal(...)`** with the same **`workflowId`**.

## Gateway 401 / SSE not authorized

- Set **`DURION_GATEWAY_TOKEN`** on the server and send **`Authorization: Bearer …`** on `fetch`, or **`access_token`** on `EventSource` URLs.

## Token stream empty or incomplete

- **Subscribe before start** — Open SSE **before** starting the workflow when using Redis or local bus (see [Streaming](streaming.md)).
- **Redis** — Worker and your **token-stream** gateway (e.g. **`examples/hitl-gateway`**) must share the same **`REDIS_URL`** and compatible stream bus configuration.

## Eval / Postgres errors

- Ensure **`DURION_EVAL_DB_URL`** (or the `dbUrl` you pass to `initEvaluation`) is valid and the schema is applied.
- `initEvaluation({ enabled: true })` **without** `dbUrl` disables capture and logs a warning.

## Still stuck?

Open an issue on the [GitHub repository](https://github.com/shaibusunnuma/durion/issues) with: Temporal version, Durion package versions, minimal repro (workflow + worker config), and whether you use Redis streaming.
