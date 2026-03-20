# Streaming examples

## Co-located (no Redis)

Single process: worker + `LocalStreamBus` + HTTP.

```bash
# Terminal 1 — Temporal dev server
temporal server start-dev

# Terminal 2 — from examples/
npm run server:streaming

# Terminal 3
curl -sN -X POST http://localhost:4000/stream \
  -H "Content-Type: application/json" \
  -d '{"message":"Write a short poem about Temporal."}'
```

## Distributed (`RedisStreamBus`)

Worker publishes chunks to Redis; API process subscribes and serves SSE.

Use the **same** `REDIS_URL` (default `redis://127.0.0.1:6379`) for both processes.

```bash
# Terminal 1 — Temporal
temporal server start-dev

# Terminal 2 — Redis (e.g. Homebrew)
brew services start redis

# Terminal 3 — worker only
npm run worker:streaming-redis

# Terminal 4 — API only
npm run server:streaming-redis

# Terminal 5
curl -sN -X POST http://localhost:4001/stream \
  -H "Content-Type: application/json" \
  -d '{"message":"Say hi in one sentence."}'
```

Optional: set `REDIS_URL` in the repo root `.env`.

## Agent + `streamState` polling

Different workflow (`streamingAgent`): progress via Temporal query, not SSE.

```bash
npm run worker:streaming
npm run client:streaming -- "Your prompt here"
```

(`worker` and `client` both invoke `streaming/run.ts` with different subcommands.)
