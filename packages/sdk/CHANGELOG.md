# @durion/sdk

## 0.3.3

### Patch Changes

- d6d242a: This release includes critical bugfixes for Real-Time Streaming and Studio Observability:

  - **@durion/sdk** (Streaming Latency Fix): Fixed an issue where SSE token streaming was falling back to chunked polling rather than real-time push. The root cause was a channel key mismatch in the Redis Pub/Sub implementation—the Temporal worker appended a run ID to the publish channel while the gateway was listening solely on the workflow ID. Removed the unused run ID scoping to ensure reliable, sub-millisecond SSE token delivery.

  - **@durion/react** (UI States during Stream): The `useRunStream` hook now correctly derives its `isStreaming` state from the underlying workflow status (running vs waiting_for_input/completed) rather than the receipt of tokens. This ensures client-side UI controls like approval/rejection buttons correctly stay disabled while the workflow is generating active streams.

  - **@durion/cli** (Cost Observability): Fixed an issue where usage data was missing from the Studio Cost Breakdown view. Improved the parsing logic so that token and cost metrics computed from execution activities are correctly attributed to individual tool calls and models within the parsed history tree.

## 0.3.2

### Patch Changes

- dba737b: - **Fix Activity Polling**: Agents can natively pause via the `waitForSignal` Temporal abstraction, saving compute overhead by idling gracefully.
  - **Dynamic Tool Timeouts**: Core SDK `tool()` execution will now dynamically proxy timeouts. You can optionally set per-tool `timeout` limits matching real-world demands instead of the static 5-minute system default.

## 0.3.1

### Patch Changes

- 8026a28: - **Fix Continue-As-New State Persistence**: `accumulatedCost` and `totalUsage` are now preserved across Continue-As-New boundaries, ensuring budget limits and usage metrics are accurately enforced for long-running Graph workflows.
  - **Fix Error Attribution**: Unhandled execution errors now properly attribute the crash to the failing node name, rather than the last successful node.

## 0.3.0

### Minor Changes

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

## 0.2.0

### Minor Changes

- a6f898f: Introduced the `graph()` primitive for declarative, state-machine-based orchestrations atop Temporal. We are shipping a highly robust graph execution engine built specifically for Agentic topology routing, expanding beyond simple DAGs to accommodate cycles, parallel execution limits, and budget management.

  ### Features

  - **`graph()` primitive:** A declarative topology builder for creating LLM-based State Machines (nodes + edges).
  - **Conditional Edge Routing:** Supported evaluating conditional jumps dynamically with pure functions parsing current state.
  - **Parallel Fan-out with Reducers:** Batch process sibling nodes in parallel (`Promise.all()`) with customizable `reducers` handling concurrent state merge conflicts safely.
  - **Error Routing:** Supported routing to fallback nodes via the implicit `"error"` exit.

  ### Safety & Guardrails

  - **Cycle Bounding:** `maxIterations` gracefully forces the graph to terminate using native `Continue-As-New` temporal behaviors to prevent infinitely generating loops.
  - **Budget Control:** `budgetLimit` performs a "pre-flight" check on the cost calculator to protect from expensive LLM calls if budgets are exceeded before executing the batch.

  ### Fixes & Integration Testing

  - Formalized an extensive integration testing suite `tests/temporal/graph-workflow.integration.test.ts`. Fixed Temporal testing isolation logic (variables shadowing the `taskQueue`) and patched the mock implementation of `runModel` activity stubs.
  - Updated `durion:streamState` to emit Realtime Node Topologies and Batch execution status.

## 0.1.0

### Minor Changes

- 5fa71df: First public release (0.1.x) — durable AI workflows and agents on Temporal (workflow, agent, Gateway-oriented React hooks, optional eval capture)
