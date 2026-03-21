# React HITL + LLM token streaming

Full-stack demo: **Vite + React** uses **`useGatewayV0TokenStream`** + **`useGatewayV0StreamState`** from `@ai-runtime/react` against **[Gateway API v0](../../docs/gateway-api-v0.md)**. **`src/exampleServerClient.ts`** holds demo `fetch` helpers for start/signal/result. **Server-Sent Events** for token deltas; **Temporal signals** for human-in-the-loop (approve / reject).

## Prerequisites

1. **Temporal** dev server (e.g. `temporal server start-dev`)
2. **Redis** (e.g. `brew services start redis`) — same **`REDIS_URL`** for the HITL worker and `example-server` (`redis://127.0.0.1:6379` by default)
3. Repo root **`.env`**: `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` (HITL worker uses Gemini)

## Run (four terminals)

From repo root (after `npm install` and `npm run build` at least once):

| Terminal | Command |
|----------|---------|
| 1 | Temporal |
| 2 | `npm run worker:hitl` (repo root) or `cd examples && npm run worker:hitl` |
| 3 | `npm run api:dev` |
| 4 | `npm run ui:hitl` |

Open **http://localhost:5173**. The UI proxies **`/v0`**, `/workflows`, and `/runs` to `http://127.0.0.1:3000` (override with `VITE_API_PROXY` in `vite.config.ts` env if needed).

### Optional gateway auth

If `example-server` has **`AI_RUNTIME_GATEWAY_TOKEN`** set, set **`VITE_AI_RUNTIME_GATEWAY_TOKEN`** to the same value in the Vite app env so SSE (`access_token` query) and `fetch` calls include the token.

## Flow

1. Client opens **SSE** `GET /v0/runs/:workflowId/token-stream` (subscribe to Redis **before** the model runs).
2. Client **POST /v0/workflows/start** with `workflowId`, `taskQueue: ai-runtime-hitl`, `workflowType: draftEmail`, `input: { topic }`.
3. Token deltas render from SSE; **`useGatewayV0StreamState`** polls `GET /v0/runs/:id/stream-state`.
4. On **Reject**, open a **new** SSE connection, then **POST /v0/runs/:id/signal** with `ai-runtime:user-input`.
5. **Approve** sends the signal without a new SSE round.

## Scripts in this package

- `npm run dev` — Vite dev server
- `npm run build` — production bundle to `dist/`
