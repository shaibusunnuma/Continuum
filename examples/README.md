# Examples

Each example lives in its own folder and shares this directory’s **`package.json`** and **`node_modules`**. From the repo root, install once:

```bash
cd examples && npm install
```

Run scripts **from `examples/`** (or `cd examples && npm run …` from the root). Example scripts are **not** duplicated on the root `package.json`.

**Prerequisites:** Temporal reachable at `TEMPORAL_ADDRESS` (default `localhost:7233`), and a root **`.env`** with the right API keys (see table). Use the [Temporal CLI](https://docs.temporal.io/cli) dev server if you like:

```bash
temporal server start-dev
```

For a minimal remote client pattern, see [REMOTE_CLIENT.md](REMOTE_CLIENT.md).

**Task queue:** Examples use the SDK default — `TASK_QUEUE` from env, or **`durion`**. The worker you run and any client (`createClient`, **Studio gateway**, **hitl-gateway**) must use the **same** queue. To run **two different example workers at once**, give each process a distinct `TASK_QUEUE` so tasks are not delivered to the wrong bundle.

## Examples in this repo

| Folder | Scripts | API keys | Notes |
|--------|---------|----------|--------|
| **customer-support** | `worker:customer-support`, `client:customer-support` | `OPENAI_API_KEY` | `client:customer-support -- demo customerSupport "…" [orderId]` or `demo travelAgent "…"`. |
| **research-assistant** | `worker:research-assistant`, `client:research-assistant` | Gemini key + optional `TAVILY_API_KEY` (web search) | `client:research-assistant -- demo contentBrief "topic" [audience]` or `demo researchAssistant "…"`. |
| **multi-agent** | `worker:multi-agent`, `client:multi-agent`, `orchestrate:multi-agent` | Gemini (same as above) | `client:multi-agent -- "Your question"` — Pattern A (one workflow). `orchestrate:multi-agent -- "…"` — Pattern B chain. |
| **streaming** | `server:streaming`, `worker:streaming`, `client:streaming`, plus Redis variants | `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY`; Redis for distributed variant | See [streaming/README.md](streaming/README.md). Co-located HTTP on port 4000; Redis variant uses 4001. |
| **human-in-the-loop** | `worker:hitl`, `client:hitl` | `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY`; **`REDIS_URL`** for token SSE with [hitl-gateway](hitl-gateway/README.md) | CLI `client:hitl` runs the scripted approve/reject flow. Optional: `server:hitl-gateway` + [react-hitl-ui](react-hitl-ui/README.md) for a browser UI. |
| **composability** | `worker:composability`, `client:composability` | `OPENAI_API_KEY` | `ctx.run()` and agent `delegates`. See [composability/README.md](composability/README.md). |

**UI demo:** [react-hitl-ui](react-hitl-ui/) — Vite app. Install **[hitl-gateway](hitl-gateway/README.md)** deps once (`cd hitl-gateway && npm install`), then **`npm run server:hitl-gateway`** or repo root **`npm run hitl-gateway:dev`**, plus **`npm run dev:react-hitl-ui`** from `examples/`.

## Run (from `examples/` after repo `npm install`, `cd examples && npm install`, and `npm run build` at repo root)

```bash
cd examples

npm run worker:customer-support
npm run client:customer-support -- demo customerSupport "I want a refund" ORD-123
npm run worker:research-assistant
npm run client:research-assistant -- demo researchAssistant "Your question"
npm run worker:multi-agent
npm run client:multi-agent -- "Your question"
npm run worker:streaming
npm run worker:streaming-redis
npm run server:streaming
npm run server:streaming-redis
npm run client:streaming -- "Your prompt"
npm run worker:hitl
npm run client:hitl
npm run worker:composability
npm run client:composability -- parent "hello"
npm run orchestrate:multi-agent -- "Your question"
npm run server:hitl-gateway
npm run dev:react-hitl-ui
```

Or one-liners from the repo root: `cd examples && npm run worker:customer-support`, etc. For the HITL UI: install **`examples/hitl-gateway`** deps once, then `npm run hitl-gateway:dev` at the repo root and, in another terminal, `cd examples && npm run dev:react-hitl-ui`.
