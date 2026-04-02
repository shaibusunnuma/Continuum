# Durion Studio gateway (`studio-server`)

HTTP app for **Durion Studio** in this monorepo: **Gateway v0** under **`/v0/studio/*`** and the **`/v0/runs/*`** routes the Studio SPA calls (describe, stream-state, result), plus optional **local OTLP** ingestion.

It is **not** a general-purpose “start any workflow from curl” server. For the **react-hitl-ui** demo (workflows/start, token SSE, signals), run **[examples/hitl-gateway](../examples/hitl-gateway/README.md)** on **`HITL_GATEWAY_PORT`** (default **3001**).

## Gateway API v0 (Studio subset)

See **[docs/gateway-api-v0.md](../docs/gateway-api-v0.md)** for the full API spec. This process implements the **Studio** and **runs** sections that Studio uses; it does **not** serve **`/v0/workflows/start`**, **`/v0/agents/*`**, **`/v0/runs/*/token-stream`**, or **`/v0/runs/*/signal`**.

Optional: set **`DURION_GATEWAY_TOKEN`** — when set, **`/v0/*`** JSON routes require `Authorization: Bearer <token>`.

## Endpoints

- **`POST /v1/traces`** — when **`DURION_STUDIO_LOCAL=true`**, accepts OTLP JSON and buffers spans for Studio (`GET /v0/studio/runs/:id/spans`). Otherwise returns `200` without ingesting.
- **`/v0/studio/*`** — run list, history, span proxy (see gateway doc).
- **`/v0/runs/:workflowId`**, **`/v0/runs/:workflowId/stream-state`**, **`/v0/runs/:workflowId/result`** — same semantics as the full gateway doc.

## Env

- **`TEMPORAL_ADDRESS`**, **`TEMPORAL_NAMESPACE`**, **`TASK_QUEUE`**, **`API_PORT`** (default **3000**)
- **`TEMPORAL_API_KEY`** / **`TEMPORAL_TLS`** — Temporal Cloud (same as `@durion/sdk`)
- **`DURION_GATEWAY_TOKEN`** (optional) — secures **`/v0/*`**
- **`DURION_STUDIO_LOCAL`**, **`DURION_OTLP_QUERY_URL`** — Studio local dev; see `packages/studio` and gateway doc

Run from repo root: **`npm run api`** (built) or **`npm run api:dev`** (ts-node).
