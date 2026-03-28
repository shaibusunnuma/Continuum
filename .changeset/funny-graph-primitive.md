---
"@durion/sdk": minor
---

Introduced the `graph()` primitive for declarative, state-machine-based orchestrations atop Temporal. We are shipping a highly robust graph execution engine built specifically for Agentic topology routing, expanding beyond simple DAGs to accommodate cycles, parallel execution limits, and budget management.

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
