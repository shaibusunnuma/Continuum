import type { GraphStreamState, StreamState } from './types';

export type RunViewMode = 'graph' | 'agent' | 'workflow';

export function detectViewMode(state: StreamState): RunViewMode {
  const g = state as GraphStreamState;
  if (g.topology && g.topology.nodes && g.topology.nodes.length > 0) {
    return 'graph';
  }
  if (
    state.currentStep !== undefined ||
    (state.messages && state.messages.length > 0)
  ) {
    return 'agent';
  }
  return 'workflow';
}
