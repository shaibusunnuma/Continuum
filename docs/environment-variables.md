# Environment variables

Single reference for values Durion, the example gateway, and typical workers read from the environment. Your app should load a `.env` at **startup** (e.g. `dotenv/config`); do not rely on the SDK to load a file from inside `node_modules`.

## Temporal (common)

| Variable | Default (if unset in SDK shared config) | Notes |
|----------|-------------------------------------------|--------|
| `TEMPORAL_ADDRESS` | `localhost:7233` | gRPC address of Temporal frontend |
| `TEMPORAL_NAMESPACE` | `default` | Namespace for workflows |
| `TASK_QUEUE` | `durion` | **Workers and clients must agree** on the queue for a given deployment |

Override per process when you run multiple workers (different queues).

## Durion gateway (example-server / your gateway)

| Variable | Purpose |
|----------|---------|
| `DURION_GATEWAY_TOKEN` | When set, **`/v0/*`** routes require `Authorization: Bearer <token>`; SSE may use `access_token` query (browsers). |

See [Gateway API v0](gateway-api-v0.md).

## Browser / Vite (HITL demo pattern)

| Variable | Purpose |
|----------|---------|
| `VITE_DURION_GATEWAY_TOKEN` | Same secret as `DURION_GATEWAY_TOKEN` for local demos so `fetch` and `EventSource` can authenticate |

Only variables prefixed with `VITE_` are exposed to client bundles in Vite.

## Evaluation (`@durion/eval`)

| Variable | Purpose |
|----------|---------|
| `DURION_EVAL_DB_URL` | Postgres URL when you call `initEvaluation({ enabled: true, dbUrl: … })` (often passed explicitly instead of env-only) |
| `DURION_EVAL_VARIANT` | Optional default variant name in examples/scripts |

Apply the eval SQL schema before capturing runs (see **`packages/eval/README.md`** in the monorepo, or your own migration pipeline).

## Observability (example-server / your app)

| Variable | Purpose |
|----------|---------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP trace endpoint when tracing is enabled in code |
| `OTEL_SERVICE_NAME` | Service name on spans |
| `DURION_PROMETHEUS_PORT` | Example server: Prometheus scrape port (default `9464` in reference code) |

Tracing and metrics are toggled in code via `initObservability()` on the runtime or worker config.

## Streaming / Redis

| Variable | Purpose |
|----------|---------|
| `REDIS_URL` | When using **`RedisStreamBus`** so workers and API share token pub/sub (e.g. `redis://127.0.0.1:6379`) |

Worker and gateway **must** use the same Redis and channel naming (workflow id) for SSE to receive chunks.

## LLM providers

Provider keys are **not** read by Durion directly. Set what your AI SDK provider expects, e.g.:

- `OPENAI_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY` / `GEMINI_API_KEY` (depending on provider docs)

## See also

- [`.env.example`](../.env.example) in the monorepo
- [Packages](packages.md) for which install pulls in what
