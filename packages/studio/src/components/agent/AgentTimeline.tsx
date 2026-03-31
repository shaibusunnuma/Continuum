import type { StreamState } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type MsgRole = NonNullable<StreamState['messages']>[number]['role'];

function roleMeta(role: MsgRole) {
  switch (role) {
    case 'user':
      return { label: 'User', rail: 'bg-chart-1', chip: 'border-chart-1/40 bg-chart-1/15 text-chart-1' };
    case 'system':
      return {
        label: 'System',
        rail: 'bg-chart-3',
        chip: 'border-chart-3/40 bg-chart-3/15 text-chart-3',
      };
    case 'assistant':
      return {
        label: 'Model',
        rail: 'bg-primary',
        chip: 'border-primary/40 bg-primary/12 text-primary',
      };
    case 'tool':
      return {
        label: 'Tool',
        rail: 'bg-warning',
        chip: 'border-warning/40 bg-warning/12 text-warning',
      };
  }
}

function formatToolCalls(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string') return raw;
  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return String(raw);
  }
}

/**
 * Agent trace: either live `durion:streamState` from the worker, or the same shape rebuilt from
 * `runModel` / `runTool` activity payloads in history when the worker is offline.
 */
export function AgentTimeline({
  state,
  source = 'live',
}: {
  state: StreamState;
  source?: 'live' | 'history';
}) {
  const messages = state.messages ?? [];
  const step = state.currentStep;

  const statusLabel =
    state.status === 'running'
      ? 'Running'
      : state.status === 'waiting_for_input'
        ? 'Waiting for input'
        : state.status === 'completed'
          ? 'Completed'
          : state.status === 'error'
            ? 'Error'
            : state.status;

  return (
    <div className="relative isolate flex max-h-[min(52vh,420px)] min-h-0 flex-col gap-3 overflow-hidden">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
        <div className="font-mono text-xs">
          <span className="text-foreground">Agent trace</span>
          <span className="text-muted-foreground">
            {source === 'history'
              ? ' · reconstructed from activity history (no worker)'
              : ' · live stream state'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
          <Badge variant="outline" className="rounded-sm tabular-nums">
            {statusLabel}
          </Badge>
          {step != null && (
            <span className="text-muted-foreground">
              loop step <span className="text-foreground">{step}</span>
            </span>
          )}
          {state.updatedAt && (
            <span className="text-muted-foreground tabular-nums" title="Last stream update">
              {new Date(state.updatedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      <ScrollArea className="h-[min(42vh,320px)] min-h-[160px] shrink-0 rounded-md border border-border pr-2">
        <div className="px-1 py-2">
          {messages.length === 0 && !state.partialReply ? (
            <p className="text-muted-foreground px-2 font-mono text-sm">No messages yet.</p>
          ) : (
            <ol className="relative space-y-0 pl-0">
              {messages.map((m, i) => {
                const meta = roleMeta(m.role);
                const toolCallsStr = formatToolCalls(m.toolCalls);
                const connectorBelow =
                  i < messages.length - 1 || (i === messages.length - 1 && !!state.partialReply);

                return (
                  <li key={`${m.role}-${i}-${m.toolCallId ?? ''}`} className="flex gap-3 pb-6 last:pb-2">
                    <div className="relative flex w-4 shrink-0 flex-col items-center pt-1">
                      <span
                        className={cn(
                          'relative z-[1] flex size-3.5 shrink-0 rounded-full ring-2 ring-background',
                          meta.rail,
                        )}
                        title={`Step ${i + 1}`}
                      />
                      {connectorBelow ? (
                        <div
                          className="bg-border/80 absolute top-[calc(0.25rem+0.875rem)] bottom-0 w-px"
                          aria-hidden
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground w-6 font-mono text-[10px] tabular-nums">
                          {i + 1}.
                        </span>
                        <Badge
                          variant="outline"
                          className={cn('rounded-sm font-mono text-[10px] uppercase', meta.chip)}
                        >
                          {meta.label}
                        </Badge>
                        {m.toolName && (
                          <Badge variant="secondary" className="rounded-sm font-mono text-[10px]">
                            {m.toolName}
                          </Badge>
                        )}
                        {m.toolCallId && (
                          <span className="text-muted-foreground font-mono text-[9px]">
                            id {m.toolCallId}
                          </span>
                        )}
                      </div>
                      {m.content ? (
                        <pre className="border-border bg-card/50 max-h-64 overflow-auto rounded-md border px-3 py-2 font-mono text-xs whitespace-pre-wrap wrap-break-word text-foreground">
                          {m.content}
                        </pre>
                      ) : null}
                      {toolCallsStr ? (
                        <div className="space-y-1">
                          <p className="text-muted-foreground font-mono text-[9px] uppercase tracking-wide">
                            Tool calls
                          </p>
                          <pre className="border-border bg-muted/20 max-h-48 overflow-auto rounded-md border px-3 py-2 font-mono text-[11px] whitespace-pre-wrap wrap-break-word">
                            {toolCallsStr}
                          </pre>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}

              {state.partialReply ? (
                <li className="relative flex gap-3 pb-2">
                  <div className="relative z-[1] flex shrink-0 flex-col items-center pt-1">
                    <span
                      className="border-primary bg-primary/25 flex size-3.5 animate-pulse rounded-full ring-2 ring-background"
                      title="Streaming"
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground w-6 font-mono text-[10px]">…</span>
                      <Badge
                        variant="outline"
                        className="rounded-sm border-primary/50 bg-primary/10 font-mono text-[10px] uppercase text-primary"
                      >
                        In progress
                      </Badge>
                    </div>
                    <pre className="border-primary/30 bg-primary/5 max-h-48 overflow-auto rounded-md border border-dashed px-3 py-2 font-mono text-xs whitespace-pre-wrap wrap-break-word">
                      {state.partialReply}
                    </pre>
                  </div>
                </li>
              ) : null}
            </ol>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
