---
"@durion/sdk": patch
"@durion/cli": patch
"@durion/eval": patch
"@durion/react": patch
---

- **Fix Continue-As-New State Persistence**: `accumulatedCost` and `totalUsage` are now preserved across Continue-As-New boundaries, ensuring budget limits and usage metrics are accurately enforced for long-running Graph workflows.
- **Fix Error Attribution**: Unhandled execution errors now properly attribute the crash to the failing node name, rather than the last successful node.
