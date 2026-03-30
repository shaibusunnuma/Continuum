# Streaming examples

## Agent + `streamState` polling (simplest)

One workflow (`streamingAgent`): progress via Temporal query — no HTTP server.

```bash
# Terminal 1 — Temporal dev server
temporal server start-dev

# Terminal 2 — from examples/
npm run worker:streaming
npm run client:streaming -- "Your prompt here"
```

(`worker` and `client:streaming` both invoke `streaming/run.ts` with different subcommands.)

## Optional: HTTP + SSE (co-located, no Redis)

If you want to exercise token streaming over HTTP in a **single** process (worker + `LocalStreamBus` + small Fastify server on port 4000):

```bash
npm run server:streaming
# elsewhere: curl -sN -X POST http://localhost:4000/stream -H "Content-Type: application/json" -d '{"message":"…"}'
```

## Optional: HTTP + SSE with `RedisStreamBus`

Worker publishes chunks to Redis; a separate API process subscribes and serves SSE. Use the **same** `REDIS_URL` (default `redis://127.0.0.1:6379`) for both.

```bash
# Terminal 1 — Temporal
temporal server start-dev

# Terminal 2 — Redis (e.g. Homebrew)
brew services start redis

# Terminal 3 — worker
npm run worker:streaming-redis

# Terminal 4 — API (port 4001)
npm run server:streaming-redis
```

Optional: set `REDIS_URL` in the repo root `.env`.

All streaming entrypoints use the default task queue (`TASK_QUEUE` or `durion`). If you run **this** worker alongside **another** example worker at the same time, set a **distinct** `TASK_QUEUE` in one of the processes so workflow tasks are not picked up by the wrong bundle.
