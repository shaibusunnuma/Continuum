---
"@durion/sdk": patch
"@durion/cli": patch
"@durion/eval": patch
"@durion/react": patch
---

- **Fix Activity Polling**: Agents can natively pause via the `waitForSignal` Temporal abstraction, saving compute overhead by idling gracefully.
- **Dynamic Tool Timeouts**: Core SDK `tool()` execution will now dynamically proxy timeouts. You can optionally set per-tool `timeout` limits matching real-world demands instead of the static 5-minute system default.
