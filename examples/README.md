# Examples

Each example is self-contained in its own folder (`worker.ts` + `workflows.ts`) and shares this directory’s `package.json` and `node_modules`.

| Folder | Description |
|--------|-------------|
| **customer-support** | Customer support workflow + travel agent. Uses OpenAI (`OPENAI_API_KEY` in `.env`). |
| **research-assistant** | Content brief workflow + research agent. Uses Google Gemini (`GEMINI_API_KEY` in `.env`). |

## Run an example worker

From repo root (after `npm run build`):

```bash
npm run worker:customer-support
# or
npm run worker:research-assistant
```

From this directory:

```bash
npm run worker:customer-support
npm run worker:research-assistant
```

Set `GEMINI_API_KEY` in the repo root `.env` for the Google Gemini provider.
