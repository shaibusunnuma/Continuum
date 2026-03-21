// ---------------------------------------------------------------------------
// Recommended API — unified hooks
// ---------------------------------------------------------------------------

export { useRunStream } from './useRunStream';
export type {
  UseRunStreamOptions,
  UseRunStreamReturn,
  RunStreamStatus,
} from './useRunStream';

export { useSendSignal } from './useSendSignal';
export type {
  UseSendSignalOptions,
  UseSendSignalReturn,
} from './useSendSignal';

// ---------------------------------------------------------------------------
// Low-level hooks (escape hatches)
// ---------------------------------------------------------------------------

export { useWorkflowStreamState } from './useWorkflowStreamState';
export type { UseWorkflowStreamStateOptions } from './useWorkflowStreamState';

export { useWorkflowTokenStream } from './useWorkflowTokenStream';
export type {
  UseWorkflowTokenStreamOptions,
  WorkflowTokenStreamStatus,
} from './useWorkflowTokenStream';

export {
  trimGatewayBase,
  gatewayV0StreamStateUrl,
  gatewayV0TokenStreamUrl,
  gatewayV0SignalUrl,
  gatewayV0ResultUrl,
  gatewayV0RunDescribeUrl,
  gatewayV0WorkflowsStartUrl,
  gatewayV0AgentsStartUrl,
} from './gateway-v0/urls';

export { createGatewayV0StreamStateQueryFn } from './gateway-v0/stream-state-query-fn';
export type { GatewayV0StreamStateQueryFnOptions } from './gateway-v0/stream-state-query-fn';

export { useGatewayV0TokenStream } from './gateway-v0/useGatewayV0TokenStream';
export type { UseGatewayV0TokenStreamOptions } from './gateway-v0/useGatewayV0TokenStream';

export { useGatewayV0StreamState } from './gateway-v0/useGatewayV0StreamState';
export type { UseGatewayV0StreamStateOptions } from './gateway-v0/useGatewayV0StreamState';
