# Examples

Each example is self-contained in its own folder (`workflows.ts`, and often `worker.ts` or a unified `run.ts`, plus `api.http` where present) and shares this directory’s `package.json` and `node_modules`. **Composability, streaming (polling demo), human-in-the-loop, and multi-agent** use a single **`run.ts`** with subcommands (`worker` vs `demo` / `orchestrate`) so worker and client code sit in one file; you still run **two processes** for Temporal (worker + client). For a minimal client in another repo, see [REMOTE_CLIENT.md](REMOTE_CLIENT.md). Use the `api.http` in each folder with the REST Client VS Code extension to trigger and poll runs where applicable.

| Folder | Description |
|--------|-------------|
| **customer-support** | Customer support workflow + travel agent. Uses OpenAI (`OPENAI_API_KEY` in `.env`). |
| **research-assistant** | Content brief workflow + research agent. Uses Google Gemini (`GEMINI_API_KEY` in `.env`). |
| **react** | ReAct agent: thought → action → observation with calculator + search tools. Uses OpenAI (`OPENAI_API_KEY`). |
| **dag** | Graph/DAG workflow: validate → route → model or tool → respond. Uses Gemini (`GEMINI_API_KEY`). |
| **plan-and-execute** | Planner emits plan (JSON steps); executor runs steps. Uses OpenAI (`OPENAI_API_KEY`). |
| **reflection** | Generate → Critic → Improve workflow. Uses Gemini (`GEMINI_API_KEY`). |
| **multi-agent** | Pattern A: one workflow with Researcher/Coder/Analyst steps. Pattern B: three agents + `run.ts orchestrate`. Uses Gemini. |
| **tree-search** | Multiple reasoning paths (optimistic/cautious/neutral), then judge picks best. Uses OpenAI. |
| **memory-augmented** | Agent with remember_fact and recall tools (in-memory stub). Uses Gemini. |
| **cognitive-layered** | Classify simple vs complex; fast model for simple, reasoning model for complex. Uses OpenAI. |
| **structured-loop** | Retrieve → Cognition → Control → Action → Memory workflow with stub tools. Uses Gemini. |
| **composability** | `ctx.run()` parent→child workflow and orchestrator agent with `delegates` to a specialist. Uses OpenAI. |
| **react-hitl-ui** | Vite + React demo: `useWorkflowStreamState`, SSE token streaming, HITL signals via `example-server` + Redis. See [react-hitl-ui/README.md](react-hitl-ui/README.md). |

## Run an example worker

From repo root (after `npm run build`):

```bash
npm run worker:customer-support
# or
npm run worker:research-assistant
# or
npm run worker:react
# or
npm run worker:dag
# or
npm run worker:plan-and-execute
# or
npm run worker:reflection
# or
npm run worker:multi-agent
# or
npm run worker:tree-search
# or
npm run worker:memory-augmented
# or
npm run worker:cognitive-layered
# or
npm run worker:structured-loop
# or
npm run worker:composability
```

From this directory:

```bash
npm run worker:customer-support
npm run worker:research-assistant
npm run worker:react
npm run worker:dag
npm run worker:plan-and-execute
npm run worker:reflection
npm run worker:multi-agent
npm run worker:tree-search
npm run worker:memory-augmented
npm run worker:cognitive-layered
npm run worker:structured-loop
npm run worker:composability
```

For Pattern B multi-agent chain, run the orchestrator (with worker already running): `npm run orchestrate:multi-agent -- "Your question"`.

For composability, with `worker:composability` running: `npm run client:composability -- parent "hello"` or `npm run client:composability -- orchestrator "Ask the specialist: ..."`. See [composability/README.md](composability/README.md).

Set `OPENAI_API_KEY` or `GEMINI_API_KEY` in the repo root `.env` as needed per example.
