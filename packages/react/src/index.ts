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
  gatewayStreamStateUrl,
  gatewayTokenStreamUrl,
  gatewaySignalUrl,
  gatewayResultUrl,
  gatewayRunDescribeUrl,
  gatewayWorkflowsStartUrl,
  gatewayAgentsStartUrl,
} from './gateway-v0/urls';

export { createGatewayStreamStateQueryFn } from './gateway-v0/stream-state-query-fn';
export type { GatewayStreamStateQueryFnOptions } from './gateway-v0/stream-state-query-fn';

export { useGatewayTokenStream } from './gateway-v0/useGatewayTokenStream';
export type { UseGatewayTokenStreamOptions } from './gateway-v0/useGatewayTokenStream';

export { useGatewayStreamState } from './gateway-v0/useGatewayStreamState';
export type { UseGatewayStreamStateOptions } from './gateway-v0/useGatewayStreamState';
