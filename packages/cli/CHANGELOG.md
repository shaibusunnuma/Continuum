# @durion/cli

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
