/**
 * Redis StreamBus channel id for token SSE. Matches worker publishing in `activities.ts`.
 * When Temporal run id is known, scopes the stream to one execution (same workflow id, different runs).
 */
export function redisStreamChannelKey(workflowId: string, temporalRunId?: string | null): string {
  const r = typeof temporalRunId === 'string' ? temporalRunId.trim() : '';
  return r ? `${workflowId}::${r}` : workflowId;
}
