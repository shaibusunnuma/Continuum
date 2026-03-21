# Gateway API v0

Versioned HTTP surface for browser and BFF clients talking to **AI Runtime** through a gateway (reference implementation: `example-server` in this monorepo). Same paths work for **self-hosted** (`baseURL` = your origin) and a **future hosted** product (different `baseURL`).

Unversioned routes (`/runs`, `/workflows`, `/agents`) remain for backward compatibility; **new integrations should use `/v0`.**

## Versioning

All v0 routes are under the **`/v0`** prefix:

- Runs: `/v0/runs/...`
- Workflows: `/v0/workflows/...`
- Agents: `/v0/agents/...`

## Authentication (optional)

If the gateway sets **`AI_RUNTIME_GATEWAY_TOKEN`**, v0 routes require:

| Kind | Requirement |
|------|-------------|
| **JSON / fetch** (`stream-state`, `signal`, `start`, `result`, `GET /runs/:id`) | Header `Authorization: Bearer <AI_RUNTIME_GATEWAY_TOKEN>` |
| **SSE** (`token-stream`) | Same token in header **or** query param **`access_token`** (EventSource cannot send custom headers in browsers). |

If **`AI_RUNTIME_GATEWAY_TOKEN`** is unset, v0 routes are open (local development).

## Runs

`runId` is the Temporal workflow id (client may choose it before start so SSE can subscribe first).

### `GET /v0/runs/{runId}/stream-state`

Returns **`StreamState`** JSON (Temporal `streamState` query):

- `status`: `'running' | 'waiting_for_input' | 'completed' | 'error'`
- `currentStep?`, `partialReply?`, `messages?`, `updatedAt`

**Success:** `200` + body.

**Errors:** `404` / `500` with JSON:

```json
{ "error": "Run not found" | "Internal server error", "message": "..." }
```

### `GET /v0/runs/{runId}/token-stream`

**Server-Sent Events** (Vercel AI UI message stream). Subscribe **before** starting the workflow when using Redis/pub-sub.

Each event: `data: <JSON>\n\n`

Common part shapes:

- `{ "type": "text-delta", "delta": "<string>" }`
- `{ "type": "finish" }`
- `{ "type": "error", "error": "<string>" }`
- `{ "type": "tool-call", ... }`, `{ "type": "tool-result", ... }` (when emitted)

Headers include AI SDK UI stream headers (`text/event-stream`, etc.).

### `POST /v0/runs/{runId}/signal`

Body: `{ "name": "<signalName>", "data"?: <any> }`

**Success:** `204` no body.

**Errors:** `404` / `500` (same error JSON shape as stream-state).

### `GET /v0/runs/{runId}`

Workflow description summary: `workflowId`, `status`, `type`, `startTime`, `closeTime`.

### `GET /v0/runs/{runId}/result`

While running: `202` with `{ workflowId, status: "RUNNING", result: null }`.  
On completion: `200` with `workflowId`, `status`, `result`.  
On failure: `200` with failure payload per server implementation.

## Workflows

### `POST /v0/workflows/start`

Body (JSON):

- `workflowType` (string, required)
- `input` (object, required)
- `workflowId` (string, optional — client-generated id for subscribe-then-start)
- `taskQueue` (string, optional)

**Success:** `201` + `{ "workflowId": "<id>" }`.

## Agents

### `POST /v0/agents/start`

Body: `{ "agentName": "<string>", "input": { "message": "<string>" } }`

**Success:** `201` + `{ "workflowId": "<id>", "runId"?: "<id>" }`.

## Client helpers

`@ai-runtime/react` exports **Gateway v0** URL builders and hooks (`useGatewayV0TokenStream`, `useGatewayV0StreamState`) that target this spec. Lower-level `useWorkflowTokenStream` / `useWorkflowStreamState` remain available for non-gateway APIs.
