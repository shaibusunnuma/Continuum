# @durion/cli

## 0.2.1

### Patch Changes

- d6d242a: This release includes critical bugfixes for Real-Time Streaming and Studio Observability:

  - **@durion/sdk** (Streaming Latency Fix): Fixed an issue where SSE token streaming was falling back to chunked polling rather than real-time push. The root cause was a channel key mismatch in the Redis Pub/Sub implementation—the Temporal worker appended a run ID to the publish channel while the gateway was listening solely on the workflow ID. Removed the unused run ID scoping to ensure reliable, sub-millisecond SSE token delivery.

  - **@durion/react** (UI States during Stream): The `useRunStream` hook now correctly derives its `isStreaming` state from the underlying workflow status (running vs waiting_for_input/completed) rather than the receipt of tokens. This ensures client-side UI controls like approval/rejection buttons correctly stay disabled while the workflow is generating active streams.

  - **@durion/cli** (Cost Observability): Fixed an issue where usage data was missing from the Studio Cost Breakdown view. Improved the parsing logic so that token and cost metrics computed from execution activities are correctly attributed to individual tool calls and models within the parsed history tree.

- Updated dependencies [d6d242a]
  - @durion/sdk@0.3.3

## 0.2.0

### Minor Changes

- 9f6ee65: ### `@durion/cli`

  - **Bundled Durion Studio:** The CLI build now copies a production Vite build of Studio into `studio-dist/` and serves it from the **same Fastify gateway** as Gateway v0 (`/` for the SPA, `/v0` / `/v1` for APIs). Running **`durion dev`** opens Studio at the gateway URL (e.g. `http://localhost:3000/`) without installing a separate Studio package.
  - **`serveBundledStudio`:** Respects **`studio: false`** / **`--no-studio`** so the SPA is not mounted when disabled.
  - **`durion studio`:** With a published CLI, points users at **`durion dev`** for the bundled UI; in the monorepo, still runs Vite when `@durion/studio` is workspace-linked for HMR.
  - **Dependencies:** Adds `@fastify/static` for static assets. **`@durion/studio`** is a **devDependency** only for monorepo builds (Studio remains private on npm); **`prepublishOnly`** runs `tsc` + **`copy-studio`**, so published tarballs include **`studio-dist`** when the full build runs.

  ### `create-durion`

  - **Agent template:** Uses **`instructions`**, **`maxSteps`**, and **`tools`** (aligned with `AgentConfig`) instead of invalid `system` / `maxModelCalls`.
  - **Docs:** Clarifies that Studio is served via **`@durion/cli`** / **`durion dev`**, not a separate **`@durion/studio`** npm dependency in generated apps.

## 0.1.3

### Patch Changes

- dba737b: - **Fix Activity Polling**: Agents can natively pause via the `waitForSignal` Temporal abstraction, saving compute overhead by idling gracefully.
  - **Dynamic Tool Timeouts**: Core SDK `tool()` execution will now dynamically proxy timeouts. You can optionally set per-tool `timeout` limits matching real-world demands instead of the static 5-minute system default.
- Updated dependencies [dba737b]
  - @durion/sdk@0.3.2

## 0.1.2

### Patch Changes

- 8026a28: - **Fix Continue-As-New State Persistence**: `accumulatedCost` and `totalUsage` are now preserved across Continue-As-New boundaries, ensuring budget limits and usage metrics are accurately enforced for long-running Graph workflows.
  - **Fix Error Attribution**: Unhandled execution errors now properly attribute the crash to the failing node name, rather than the last successful node.
- Updated dependencies [8026a28]
  - @durion/sdk@0.3.1

## 0.1.1

### Patch Changes

- Updated dependencies [772fdbe]
  - @durion/sdk@0.3.0
