# create-durion

Scaffold a new **[Durion](https://github.com/shaibusunnuma/durion)** project — durable **`workflow()`** / **`agent()`** apps on Temporal with the Vercel AI SDK.

## Usage

```bash
npx create-durion@latest [project-name]
```

Interactive prompts ask for:

- Project directory name  
- Template: **`hello`** (single workflow), **`agent`** (autonomous agent + tools), **`blank`** (minimal stubs)  
- LLM provider: **OpenAI**, **Anthropic**, or **Google**  
- API key (or set later in **`.env`**)

## Flags (non-interactive)

| Flag | Description |
|------|-------------|
| **`--template <name>`** | `hello`, `agent`, or `blank` |
| **`--llm <provider>`** | `openai`, `anthropic`, `google` |
| **`--llm-api-key <key>`** | Provider API key |
| **`--default`** | Skip all prompts: **`hello`** + OpenAI + directory **`my-durion-app`** (or pass a name as the argument) |
| **`--no-install`** | Skip **`npm install`** / **`pnpm install`** / etc. after scaffold |

Example:

```bash
npx create-durion@latest /tmp/demo --default --no-install
```

## Generated project

Typical output includes **`package.json`**, **`tsconfig.json`** (Node16-style module resolution for bundling), **`.env`**, **`durion.config.ts`**, workflow and worker entry files, and provider-specific dependencies. **`@durion/cli`** includes a bundled Durion Studio SPA served from the dev gateway (default `http://localhost:3000/`) when you run **`npx durion dev`**. [Temporal CLI](https://docs.temporal.io/cli) is detected with OS-specific install hints when missing.

## Next steps

```bash
cd your-project
npm install
npx durion doctor
npx durion dev
```

The template lists **`@durion/cli`** as a devDependency; Studio ships **inside** that package (not as a separate **`@durion/studio`** on npm) and is served by **`durion dev`** with the gateway.

## See also

- [Getting started](../docs/getting-started.md)  
- [`@durion/cli`](../packages/cli/README.md)  
- [Packages overview](../docs/packages.md)
