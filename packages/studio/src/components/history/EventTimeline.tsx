import { useState } from 'react';
import type { HistoryEvent } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const CATEGORY_WORKFLOW_TASK = 'wft';
const CATEGORY_ACTIVITY = 'activity';
const CATEGORY_WORKFLOW = 'workflow';
const CATEGORY_OTHER = 'other';

type Category = typeof CATEGORY_WORKFLOW_TASK | typeof CATEGORY_ACTIVITY | typeof CATEGORY_WORKFLOW | typeof CATEGORY_OTHER;

function categorize(eventType: string): Category {
  if (eventType.includes('WORKFLOW_TASK')) return CATEGORY_WORKFLOW_TASK;
  if (eventType.includes('ACTIVITY_TASK')) return CATEGORY_ACTIVITY;
  if (eventType.includes('WORKFLOW_EXECUTION') || eventType.includes('WORKFLOW_PROPERTIES'))
    return CATEGORY_WORKFLOW;
  return CATEGORY_OTHER;
}

function dotColor(eventType: string): string {
  if (eventType.includes('FAILED') || eventType.includes('TIMED_OUT'))
    return 'bg-destructive';
  if (eventType.includes('COMPLETED') || eventType.includes('STARTED'))
    return 'bg-primary';
  if (eventType.includes('SCHEDULED') || eventType.includes('INITIATED'))
    return 'bg-muted-foreground/60';
  if (eventType.includes('CANCELED') || eventType.includes('TERMINATED'))
    return 'bg-destructive/60';
  return 'bg-muted-foreground/40';
}

function formatTime(eventTime?: string): string {
  if (!eventTime) return '';
  const d = new Date(eventTime);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleTimeString(undefined, { hour12: false, fractionalSecondDigits: 3 });
  } catch {
    return '';
  }
}

interface Props {
  events: HistoryEvent[];
  /** When true, hide low-level WorkflowTask events for a cleaner view. */
  compact?: boolean;
  /** Scroll area height (Tailwind class). Default: tall panel for standalone use. */
  scrollAreaClassName?: string;
}

export function EventTimeline({ events, compact = true, scrollAreaClassName }: Props) {
  const [showAll, setShowAll] = useState(!compact);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const visible = showAll
    ? events
    : events.filter((e) => categorize(e.eventType) !== CATEGORY_WORKFLOW_TASK);

  const toggle = (eventId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  if (events.length === 0) {
    return (
      <p className="text-muted-foreground font-mono text-sm">
        No events in history.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground font-mono text-xs">
          {visible.length} event{visible.length !== 1 ? 's' : ''}
          {!showAll && visible.length < events.length && (
            <span className="text-muted-foreground/60">
              {' '}(hiding {events.length - visible.length} workflow-task events)
            </span>
          )}
        </span>
        {compact && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="text-muted-foreground hover:text-foreground cursor-pointer font-mono text-[10px] underline-offset-2 hover:underline"
          >
            {showAll ? 'compact' : 'show all'}
          </button>
        )}
      </div>

      <ScrollArea
        className={cn(
          'rounded-md border border-border',
          scrollAreaClassName ?? 'h-[min(70vh,560px)]',
        )}
      >
        <ol className="space-y-0 divide-y divide-border font-mono text-xs">
          {visible.map((ev) => {
            const isExpanded = expanded.has(ev.eventId);
            const hasDetails = ev.details && Object.keys(ev.details).length > 0;
            return (
              <li key={ev.eventId} className="group">
                <button
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-2.5 text-left',
                    hasDetails && 'cursor-pointer hover:bg-secondary/30',
                    !hasDetails && 'cursor-default',
                  )}
                  onClick={() => hasDetails && toggle(ev.eventId)}
                  disabled={!hasDetails}
                  type="button"
                >
                  <span className="text-muted-foreground/50 w-6 shrink-0 pt-px text-right tabular-nums">
                    {ev.eventId}
                  </span>
                  <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', dotColor(ev.eventType))} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <span className="text-foreground">{ev.label}</span>
                  </div>
                  <span className="text-muted-foreground/40 shrink-0 tabular-nums">
                    {formatTime(ev.eventTime)}
                  </span>
                  {hasDetails && (
                    <span className="text-muted-foreground/40 w-4 shrink-0 text-center">
                      {isExpanded ? '−' : '+'}
                    </span>
                  )}
                </button>
                {isExpanded && ev.details && (
                  <div className="border-t border-border/40 bg-secondary/20 px-4 py-3">
                    <pre className="max-h-60 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground wrap-break-word">
                      {JSON.stringify(ev.details, null, 2)}
                    </pre>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </ScrollArea>
    </div>
  );
}
