# @durion/react

Universal React hooks for **Durion workflows** (Temporal + Gateway HTTP API).

## Quick Start — `useRunStream` (recommended)

A single hook that merges SSE token streaming + polled stream-state. Pass a `runId` and get back real-time text, run status, and metadata.

```tsx
import { useRunStream, useSendSignal } from '@durion/react';

function ChatResponse({ runId }: { runId: string }) {
  const { text, status, run, error } = useRunStream(runId, {
    baseURL: '',        // same-origin or your gateway URL
    accessToken: token, // optional
    pollIntervalMs: 1000,
    onToken: (delta) => console.log(delta),
  });

  const { send } = useSendSignal({ baseURL: '' });

  if (error) return <div>Error: {error.message}</div>;
  if (status === 'waiting_for_input') {
    return <button onClick={() => send(runId, { approved: true })}>Approve</button>;
  }

  return <div>{text}</div>;
}
```

### What `useRunStream` does internally

1. Opens `EventSource` to `GET /v0/runs/:id/token-stream` → accumulates text deltas
2. Polls `GET /v0/runs/:id/stream-state` → provides run metadata (status, step count, messages)
3. Falls back to polled `partialReply` if SSE misses early tokens

### `useSendSignal`

Sends signals (e.g. HITL input) to a running workflow via `POST /v0/runs/:id/signal`.

```tsx
const { send, isSending, error } = useSendSignal({ baseURL: '', accessToken });
await send(runId, { approved: true });
await send(runId, 'some text', 'custom:signal-name'); // custom signal name
```

---

## Low-level hooks (escape hatches)

For non-gateway or custom paths:

| Concern | Hook | Notes |
|---------|------|-------|
| Token SSE | **`useWorkflowTokenStream`** | Requires `getTokenStreamUrl(runId)`. Has `subscribeThenStart` for zero-drop. |
| Polled UI state | **`useWorkflowStreamState`** | Requires custom `queryFn`. |

---

## Gateway v0 helpers

URL builders and pre-wired wrappers for the standard Gateway API v0 paths (names omit “v0”; URLs still use `/v0/...`):

| Helper | Purpose |
|--------|---------|
| `useGatewayTokenStream` | SSE via `GET /v0/runs/:id/token-stream` |
| `useGatewayStreamState` | Polls `GET /v0/runs/:id/stream-state` |
| `gatewayWorkflowsStartUrl` | URL builder for `POST /v0/workflows/start` |
| `gatewaySignalUrl` | URL builder for `POST /v0/runs/:id/signal` |
| `gatewayResultUrl` | URL builder for `GET /v0/runs/:id/result` |
| `createGatewayStreamStateQueryFn` | Factory for poll `queryFn` |

> **Note:** These are now considered low-level. Prefer `useRunStream` for new code.

---

## Run-scoped streaming

`useRunStream` takes a `runId`, optional `baseURL`, and optional gateway token — the same shape you’d use for any client that opens an SSE URL and polls run metadata against **your** HTTP API (e.g. Gateway API v0), not a vendor-hosted endpoint.

---

## Peer dependency

- `react` ^18 or ^19
