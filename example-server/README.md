# Example server

Reference REST API server for Durion. Not part of the SDK — it’s a sample app that shows how to start workflows and agents via HTTP using `@durion/sdk` and `@temporalio/client`.

**Demo only:** unversioned routes have no authentication. Do not expose `POST /runs/:workflowId/signal` or open CORS to the public internet without hardening.

## Gateway API v0

Versioned routes under **`/v0`** mirror the same behavior as below (`/v0/runs/...`, `/v0/workflows/...`, `/v0/agents/...`). See **[docs/gateway-api-v0.md](../docs/gateway-api-v0.md)**.

Optional: set **`DURION_GATEWAY_TOKEN`** — when set, all **`/v0/*`** routes require `Authorization: Bearer <token>` on JSON endpoints, and **`access_token` query or Bearer** on **`GET /v0/runs/:id/token-stream`** (browsers use the query param with `EventSource`).

## Endpoints (legacy + v0)

- **POST /workflows/start** — body: `{ workflowType, input, workflowId?, taskQueue? }`. If `workflowId` is omitted, the server generates one. If `taskQueue` is omitted, uses `TASK_QUEUE` from env.
- **POST /agents/start** — start an agent by name and input
- **GET /runs/:workflowId** — run status
- **GET /runs/:workflowId/result** — run result (or 202 while running)
- **GET /runs/:workflowId/stream-state** — Temporal query `durion:streamState` (for `useWorkflowStreamState`)
- **GET /runs/:workflowId/token-stream** — SSE of LLM token deltas (Vercel AI UI stream format). Uses **`RedisStreamBus`**; must match the worker’s `REDIS_URL` and channel id = Temporal workflow id. **Subscribe (open this request) before starting the workflow or sending a reject signal** so pub/sub does not miss chunks.
- **POST /runs/:workflowId/signal** — body: `{ name: string, data?: unknown }` (e.g. `{ "name": "durion:user-input", "data": { "action": "approve" } }`)

## Env

- `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TASK_QUEUE`, `API_PORT`
- **`TASK_QUEUE` must match the worker** you run. Example: `examples/customer-support` uses queue `durion-customer-support`; set `TASK_QUEUE=durion-customer-support` (or pass `"taskQueue"` on **POST /workflows/start**) when driving that worker via this server. Same idea for `durion-research-assistant` and the research example.
- **`REDIS_URL`** — default `redis://127.0.0.1:6379`; required for token SSE when the worker runs in another process (see `examples/react-hitl-ui`).
- **`DURION_GATEWAY_TOKEN`** (optional) — secures **`/v0/*`** only; see Gateway doc above.

Run from repo root: `npm run api` (built) or `npm run api:dev` (ts-node).
