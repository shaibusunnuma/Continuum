# @durion/react

## 0.2.5

### Patch Changes

- d6d242a: This release includes critical bugfixes for Real-Time Streaming and Studio Observability:

  - **@durion/sdk** (Streaming Latency Fix): Fixed an issue where SSE token streaming was falling back to chunked polling rather than real-time push. The root cause was a channel key mismatch in the Redis Pub/Sub implementation—the Temporal worker appended a run ID to the publish channel while the gateway was listening solely on the workflow ID. Removed the unused run ID scoping to ensure reliable, sub-millisecond SSE token delivery.

  - **@durion/react** (UI States during Stream): The `useRunStream` hook now correctly derives its `isStreaming` state from the underlying workflow status (running vs waiting_for_input/completed) rather than the receipt of tokens. This ensures client-side UI controls like approval/rejection buttons correctly stay disabled while the workflow is generating active streams.

  - **@durion/cli** (Cost Observability): Fixed an issue where usage data was missing from the Studio Cost Breakdown view. Improved the parsing logic so that token and cost metrics computed from execution activities are correctly attributed to individual tool calls and models within the parsed history tree.

- Updated dependencies [d6d242a]
  - @durion/sdk@0.3.3

## 0.2.4

### Patch Changes

- dba737b: - **Fix Activity Polling**: Agents can natively pause via the `waitForSignal` Temporal abstraction, saving compute overhead by idling gracefully.
  - **Dynamic Tool Timeouts**: Core SDK `tool()` execution will now dynamically proxy timeouts. You can optionally set per-tool `timeout` limits matching real-world demands instead of the static 5-minute system default.
- Updated dependencies [dba737b]
  - @durion/sdk@0.3.2

## 0.2.3

### Patch Changes

- 8026a28: - **Fix Continue-As-New State Persistence**: `accumulatedCost` and `totalUsage` are now preserved across Continue-As-New boundaries, ensuring budget limits and usage metrics are accurately enforced for long-running Graph workflows.
  - **Fix Error Attribution**: Unhandled execution errors now properly attribute the crash to the failing node name, rather than the last successful node.
- Updated dependencies [8026a28]
  - @durion/sdk@0.3.1

## 0.2.2

### Patch Changes

- 772fdbe: ### @durion/sdk

  - Cost / pricing: `createTableCostCalculator`, `EXAMPLE_PRICING_ROWS`, `resolvePricingRow`, `pricingProviderMatches`, `normalizeCostCalculationResult`; `Usage.costAttribution` on model results; optional `costCalculator` on calls.
  - `RunModelResult.modelId` (registry id) on activity results.
  - Temporal Cloud / TLS env alignment; `createClient` / worker connection merge.
  - Workflow memo upsert `durion:usage` for Studio run list metadata.

  ### @durion/cli

  - First publish: `durion dev`, `durion doctor`, `durion studio`; `defineConfig()` / `durion.config.ts`; built-in Gateway v0 + OTLP ingestion for Studio; Temporal dev server management.

  ### create-durion

  - First publish: `npx create-durion` interactive scaffolder; templates `hello`, `agent`, `blank`; OpenAI, Anthropic, Google; `--default`, `--no-install`, and non-interactive template/LLM flags.

  ### @durion/react

  - Bump `@durion/sdk` dependency range to ^0.3.0.

  ### @durion/eval

  - Bump `@durion/sdk` dependency range to ^0.3.0.

- Updated dependencies [772fdbe]
  - @durion/sdk@0.3.0

## 0.2.1

### Patch Changes

- Updated dependencies [a6f898f]
  - @durion/sdk@0.2.0

## 0.2.0

### Minor Changes

- 4ec1ff1: Rename Gateway-related public exports to drop `V0` from identifiers (for example `useGatewayTokenStream`, `useGatewayStreamState`, `gatewaySignalUrl`, `createGatewayStreamStateQueryFn`). Behavior is unchanged; URLs still target Gateway API v0 (`/v0/...`). Documented in `docs/gateway-api-v0.md` and package README.

## 0.1.0

### Minor Changes

- 5fa71df: First public release (0.1.x) — durable AI workflows and agents on Temporal (workflow, agent, Gateway-oriented React hooks, optional eval capture)

### Patch Changes

- Updated dependencies [5fa71df]
  - @durion/sdk@1.0.0
