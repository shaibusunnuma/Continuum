# Gateway API v0

Versioned HTTP surface for browser and BFF clients talking to **Durion** through a gateway (reference implementation: `example-server` in this monorepo). Same paths work for **self-hosted** (`baseURL` = your origin) and a **future hosted** product (different `baseURL`).

Unversioned routes (`/runs`, `/workflows`, `/agents`) remain for backward compatibility; **new integrations should use `/v0`.**

## Versioning

All v0 routes are under the **`/v0`** prefix:

- Runs: `/v0/runs/...`
- Workflows: `/v0/workflows/...`
- Agents: `/v0/agents/...`
- Studio (Durion Studio / observability): `/v0/studio/...`

## Authentication (optional)

If the gateway sets **`DURION_GATEWAY_TOKEN`**, v0 routes require:

| Kind | Requirement |
|------|-------------|
| **JSON / fetch** (`stream-state`, `signal`, `start`, `result`, `GET /runs/:id`) | Header `Authorization: Bearer <DURION_GATEWAY_TOKEN>` |
| **SSE** (`token-stream`) | Same token in header **or** query param **`access_token`** (EventSource cannot send custom headers in browsers). |

If **`DURION_GATEWAY_TOKEN`** is unset, v0 routes are open (local development).

## Runs

`runId` is the Temporal workflow id (client may choose it before start so SSE can subscribe first).

### `GET /v0/runs/{runId}/stream-state`

Path `{runId}` is the **Temporal workflow id**. Optional query **`runId=<Temporal execution run id>`** pins a specific execution when the same workflow id is reused (same semantics as other run-scoped GETs).

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

Path `{runId}` is the **workflow id**. The Redis/SSE channel is **`workflowId`** by default, or **`workflowId::<temporalRunId>`** when query **`runId=<Temporal execution run id>`** is set (must match the worker’s streaming channel from `traceContext.runId`). Optional **`access_token`** still applies for gateway auth.

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

## Studio (Durion Studio)

These routes power the **Durion Studio** SPA (run list + event history). They use the same optional **`DURION_GATEWAY_TOKEN`** auth as other v0 JSON endpoints.

### `GET /v0/studio/runs`

Lists workflow executions via Temporal visibility (paginated).

**Query parameters:**

| Name | Description |
|------|-------------|
| `limit` | Page size (default `20`, max `100`). |
| `nextPageToken` | Opaque token from the previous response (`nextPageToken` field) for the next page. |
| `query` | Optional Temporal visibility query string (see [Temporal visibility](https://docs.temporal.io/visibility)). |

**Success:** `200` with JSON:

```json
{
  "runs": [
    {
      "workflowId": "...",
      "runId": "...",
      "workflowType": "...",
      "status": "RUNNING",
      "taskQueue": "...",
      "startTime": "2026-01-01T00:00:00.000Z",
      "closeTime": null
    }
  ],
  "nextPageToken": "..."
}
```

`nextPageToken` is omitted when there is no further page.

**Errors:** `500` with `{ "error": "Internal server error", "message": "..." }`.

### `GET /v0/studio/runs/{workflowId}/history`

Returns the workflow **event history** as JSON (same norm as other Temporal JSON history tools), for workflow-scoped debugging and activity-step views.

**Success:** `200` + history JSON (object with `events`, etc.).

**Errors:** `404` if the run is not found; `500` on server error (same error JSON shape as stream-state where applicable).

## Client helpers

`@durion/react` exports **Gateway v0** URL builders and hooks (`useGatewayTokenStream`, `useGatewayStreamState`) that target this spec (names omit “v0”; routes are still `/v0/...`). Lower-level `useWorkflowTokenStream` / `useWorkflowStreamState` remain available for non-gateway APIs.
