---
"@durion/react": patch
"@durion/sdk": patch
"@durion/cli": patch
---

This release includes critical bugfixes for Real-Time Streaming and Studio Observability:

- **@durion/sdk** (Streaming Latency Fix): Fixed an issue where SSE token streaming was falling back to chunked polling rather than real-time push. The root cause was a channel key mismatch in the Redis Pub/Sub implementation—the Temporal worker appended a run ID to the publish channel while the gateway was listening solely on the workflow ID. Removed the unused run ID scoping to ensure reliable, sub-millisecond SSE token delivery.

- **@durion/react** (UI States during Stream): The `useRunStream` hook now correctly derives its `isStreaming` state from the underlying workflow status (running vs waiting_for_input/completed) rather than the receipt of tokens. This ensures client-side UI controls like approval/rejection buttons correctly stay disabled while the workflow is generating active streams.

- **@durion/cli** (Cost Observability): Fixed an issue where usage data was missing from the Studio Cost Breakdown view. Improved the parsing logic so that token and cost metrics computed from execution activities are correctly attributed to individual tool calls and models within the parsed history tree.
