# Streaming

Durion separates two ideas:

1. **Durable completion** — The workflow finishes with a normal result (text, structured output, agent reply) through Temporal activities. This is what **`await handle.result()`** returns.
2. **Ephemeral token stream** — Partial LLM output for UI responsiveness is published **outside** Temporal event history (high-volume tokens would overwhelm history size and event counts).

## How token streaming works (mental model)

- Activities may call **`streamText`** (Vercel AI SDK) and push chunks to a **`StreamBus`**:
  - **`LocalStreamBus`** — in-process; suitable when worker and HTTP layer share a process.
  - **`RedisStreamBus`** — Redis pub/sub; suitable when the API server and worker are **different processes** (typical production).
- Your HTTP gateway exposes **Server-Sent Events** (SSE), e.g. **`GET /v0/runs/:runId/token-stream`** in [Gateway API v0](gateway-api-v0.md).
- The **`@durion/react`** package includes hooks that open `EventSource` and merge deltas with polled **stream state**.

## Subscribe before start

Pub/sub channels are usually keyed by **workflow run id**. If the client opens SSE **after** the model has already emitted chunks, **those earlier chunks are not replayed** by default.

**Recommended pattern:** allocate a `workflowId`, open the SSE connection, **then** start the workflow with that id so the UI does not miss early tokens.

## Progressive state without SSE

Even without token streaming, workflows expose a Temporal **query** **`durion:streamState`** (status, optional `partialReply`, `messages`, etc.). Poll that through your backend — **`useGatewayStreamState`** does this against Gateway v0.

## Security

If you enable **`DURION_GATEWAY_TOKEN`**, browsers cannot set arbitrary headers on `EventSource`; use the **`access_token`** query parameter as described in [Gateway API v0](gateway-api-v0.md).

## Reference implementation

See **`examples/hitl-gateway/`** for a minimal Gateway v0 with Redis token SSE, and **`examples/react-hitl-ui/`** for a Vite client. **`studio-server`** is the Durion Studio backend only (no token-stream route).
