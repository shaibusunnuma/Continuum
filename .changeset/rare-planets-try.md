---
"create-durion": patch
"@durion/cli": minor
---

### `@durion/cli`

- **Bundled Durion Studio:** The CLI build now copies a production Vite build of Studio into `studio-dist/` and serves it from the **same Fastify gateway** as Gateway v0 (`/` for the SPA, `/v0` / `/v1` for APIs). Running **`durion dev`** opens Studio at the gateway URL (e.g. `http://localhost:3000/`) without installing a separate Studio package.
- **`serveBundledStudio`:** Respects **`studio: false`** / **`--no-studio`** so the SPA is not mounted when disabled.
- **`durion studio`:** With a published CLI, points users at **`durion dev`** for the bundled UI; in the monorepo, still runs Vite when `@durion/studio` is workspace-linked for HMR.
- **Dependencies:** Adds `@fastify/static` for static assets. **`@durion/studio`** is a **devDependency** only for monorepo builds (Studio remains private on npm); **`prepublishOnly`** runs `tsc` + **`copy-studio`**, so published tarballs include **`studio-dist`** when the full build runs.

### `create-durion`

- **Agent template:** Uses **`instructions`**, **`maxSteps`**, and **`tools`** (aligned with `AgentConfig`) instead of invalid `system` / `maxModelCalls`.
- **Docs:** Clarifies that Studio is served via **`@durion/cli`** / **`durion dev`**, not a separate **`@durion/studio`** npm dependency in generated apps.
