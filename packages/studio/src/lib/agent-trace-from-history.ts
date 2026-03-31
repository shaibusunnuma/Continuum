import type { ParsedHistory, StreamState } from '@/lib/types';

type RunModelInput = {
  messages?: Array<{
    role: string;
    content?: string;
    toolCalls?: unknown[];
    toolName?: string;
    toolCallId?: string;
  }>;
};

type RunModelOutput = {
  content?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
};

type RunToolInput = { toolName?: string };
type RunToolOutput = { result?: unknown };

/**
 * Rebuild a stream-state-shaped message list from Temporal activity payloads when the worker
 * is offline (no `durion:streamState` query). Graph topology works without a worker because it
 * lives in memo; agent conversation does not — only activities record model/tool boundaries.
 */
export function reconstructAgentStreamStateFromHistory(
  history: ParsedHistory,
  opts: { workflowStatus?: string | null },
): StreamState | null {
  const primitive = history.memo?.['durion:primitive'];
  const looksAgent =
    primitive === 'agent' ||
    (primitive == null &&
      history.activitySteps.some((s) => s.activityName === 'runModel') &&
      history.activitySteps.some((s) => s.activityName === 'runTool'));

  if (!looksAgent) return null;

  const messages: NonNullable<StreamState['messages']> = [];
  let usedFirstRunModelInput = false;
  let modelSteps = 0;

  for (const step of history.activitySteps) {
    if (step.activityName === 'runLifecycleHooks') continue;

    if (step.activityName === 'runModel') {
      const input = step.input as RunModelInput | undefined;
      if (!usedFirstRunModelInput && Array.isArray(input?.messages)) {
        for (const m of input.messages) {
          if (
            m.role === 'system' ||
            m.role === 'user' ||
            m.role === 'assistant' ||
            m.role === 'tool'
          ) {
            messages.push({
              role: m.role,
              content: typeof m.content === 'string' ? m.content : String(m.content ?? ''),
              toolCalls: m.toolCalls,
              toolName: m.toolName,
              toolCallId: m.toolCallId,
            });
          }
        }
        usedFirstRunModelInput = true;
      }

      const result = step.result as RunModelOutput | null | undefined;
      if (
        result &&
        (result.content !== undefined ||
          (Array.isArray(result.toolCalls) && result.toolCalls.length > 0))
      ) {
        modelSteps += 1;
        messages.push({
          role: 'assistant',
          content: result.content ?? '',
          toolCalls: result.toolCalls?.length ? result.toolCalls : undefined,
        });
      }
    } else if (step.activityName === 'runTool') {
      const inp = step.input as RunToolInput | undefined;
      const res = step.result as RunToolOutput | null | undefined;
      let content = '';
      try {
        content =
          typeof res?.result === 'string'
            ? res.result
            : JSON.stringify(res?.result ?? null, null, 2);
      } catch {
        content = String(res?.result ?? '');
      }
      messages.push({
        role: 'tool',
        toolName: inp?.toolName,
        content,
      });
    }
  }

  if (messages.length === 0) return null;

  const running = opts.workflowStatus === 'RUNNING';
  const t =
    history.historyEndMs != null
      ? new Date(history.historyEndMs).toISOString()
      : new Date().toISOString();

  return {
    status: running ? 'running' : 'completed',
    currentStep: modelSteps,
    partialReply: undefined,
    messages,
    updatedAt: t,
  };
}
