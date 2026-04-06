# React HITL + LLM token streaming

Full-stack demo: **Vite + React** uses **`useRunStream`** + **`useSendSignal`** from `@durion/react` against **[Gateway API v0](../../docs/gateway-api-v0.md)** (same `/v0/...` routes). **`src/exampleServerClient.ts`** holds demo `fetch` helpers for start/signal/result. **Server-Sent Events** for token deltas; **Temporal signals** for human-in-the-loop (approve / reject).

## Prerequisites

1. **Temporal** dev server (e.g. `temporal server start-dev`)
2. **Redis** (e.g. `brew services start redis`) — same **`REDIS_URL`** for the HITL worker and **[examples/hitl-gateway](../hitl-gateway/README.md)** (`redis://127.0.0.1:6379` by default)
3. Repo root **`.env`**: `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` (HITL worker uses Gemini)

## Run (four terminals)

From repo root (after `npm install`, `npm run build`, and **`cd examples/hitl-gateway && npm install`** once):

| Terminal | Command |
|----------|---------|
| 1 | Temporal |
| 2 | `cd examples && npm run worker:hitl` |
| 3 | `npm run hitl-gateway:dev` or `cd examples && npm run server:hitl-gateway` |
| 4 | `cd examples && npm run dev:react-hitl-ui` |

Open **http://localhost:5173**. The UI proxies **`/v0`** to `http://127.0.0.1:3001` (override with **`VITE_API_PROXY`** if needed). The Vite config disables proxy timeouts and sets **`x-accel-buffering: no`** on **`text/event-stream`** responses so **token SSE** chunks are not held until the stream ends (without that, the draft can appear all at once in dev).

**Durion Studio** uses **`npm run api:dev`** (**`studio-server`**, port **3000**) — not this demo gateway.

### Optional gateway auth

If the HITL gateway has **`DURION_GATEWAY_TOKEN`** set, set **`VITE_DURION_GATEWAY_TOKEN`** to the same value in the Vite app env so SSE (`access_token` query) and `fetch` calls include the token.

## Flow

1. Client opens **SSE** `GET /v0/runs/:workflowId/token-stream` (subscribe to Redis **before** the model runs).
2. Client **POST /v0/workflows/start** with `workflowId`, `workflowType: draftEmail`, `input: { topic }`. Omit `taskQueue` to use the server’s `TASK_QUEUE` (default `durion`), matching the HITL worker.
3. Token deltas render from SSE; **`useRunStream`** also polls `GET /v0/runs/:id/stream-state`.
4. On **Reject**, open a **new** SSE connection, then **POST /v0/runs/:id/signal** with `durion:user-input`.
5. **Approve** sends the signal without a new SSE round.

## Scripts

Defined on **[`examples/package.json`](../package.json)** (run from `examples/`):

- `npm run server:hitl-gateway` — runs **`examples/hitl-gateway`** (install deps there first; see [hitl-gateway README](../hitl-gateway/README.md))
- `npm run dev:react-hitl-ui` — Vite dev server
- `npm run build:react-hitl-ui` — production bundle to `react-hitl-ui/dist/`
- `npm run preview:react-hitl-ui` — preview production build

From repo root: **`npm run hitl-gateway:dev`** starts the same gateway.
