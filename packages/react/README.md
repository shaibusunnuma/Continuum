# @ai-runtime/react

Universal React helpers for **Temporal + a gateway HTTP API**.

## Gateway API v0 (recommended)

When your server implements **[Gateway API v0](../../docs/gateway-api-v0.md)** (reference: `example-server` in this monorepo), use **Trigger-style** options: `baseURL`, `workflowId` / `runId`, optional `accessToken`.

| Hook | Purpose |
|------|--------|
| **`useGatewayV0TokenStream`** | SSE token stream — `GET /v0/runs/:id/token-stream`. `accessToken` is sent as `access_token` query (EventSource cannot set headers). |
| **`useGatewayV0StreamState`** | Polls `GET /v0/runs/:id/stream-state` — **not** streaming. Optional `accessToken` as `Authorization: Bearer`. |

URL builders (for your own `fetch` calls): **`gatewayV0WorkflowsStartUrl`**, **`gatewayV0SignalUrl`**, **`gatewayV0ResultUrl`**, **`createGatewayV0StreamStateQueryFn`**, etc.

```tsx
import { useGatewayV0TokenStream, useGatewayV0StreamState } from '@ai-runtime/react';

const accessToken = import.meta.env.VITE_AI_RUNTIME_GATEWAY_TOKEN || undefined;

const stream = useGatewayV0TokenStream({ baseURL: '', accessToken });
const { state, loading, error } = useGatewayV0StreamState({
  workflowId,
  baseURL: '',
  accessToken,
  pollIntervalMs: 1500,
});
```

`"sideEffects": false` for predictable bundling.

---

## Low-level hooks (escape hatch)

For **non-gateway** or custom paths, use:

| Concern | Mechanism |
|--------|-----------|
| Token SSE | **`useWorkflowTokenStream`** + **`getTokenStreamUrl(runId)`** — full URL string. |
| Polled UI state | **`useWorkflowStreamState`** + **`queryFn`** — your `fetch` / JSON. |

---

## Compared to [Trigger.dev realtime streams](https://trigger.dev/docs/realtime/react-hooks/streams)

Trigger’s hooks use `runId` + `accessToken` + optional `baseURL` against **their** API. **Gateway v0** is the same idea: fixed paths under **`/v0`**, your **`baseURL`** (self-host or future cloud), and optional **scoped/shared token** (`AI_RUNTIME_GATEWAY_TOKEN` on the server; `access_token` / `Authorization` on the client).

---

## Full-stack demo

**[examples/react-hitl-ui](../../examples/react-hitl-ui)** — Gateway v0 + `exampleServerClient.ts` for `fetch` helpers.

---

## Peer dependency

- `react` ^18 or ^19
