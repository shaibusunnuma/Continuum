# @durion/cli

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
