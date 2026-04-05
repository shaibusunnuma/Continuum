import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { getHistory, runDetailHref } from '@/lib/api';
import { parseFullHistory } from '@/lib/parse-history';
import type { ActivityStep, ParsedHistory } from '@/lib/types';
import { EventHistoryGantt } from '@/components/history/EventHistoryGantt';
import { ActivityList } from '@/components/workflow/ActivityList';
import { Button } from '@/components/ui/button';

function compareExecutionSpan(
  a: { scheduledAt: number; key: string },
  b: { scheduledAt: number; key: string },
): number {
  const d = a.scheduledAt - b.scheduledAt;
  if (d !== 0) return d;
  return a.key.localeCompare(b.key);
}

function mergedSpansForChild(h: ParsedHistory) {
  const { activitySpans, childWorkflowSpans } = h;
  if (childWorkflowSpans.length === 0) return activitySpans;
  if (activitySpans.length === 0) return [...childWorkflowSpans].sort(compareExecutionSpan);
  return [...activitySpans, ...childWorkflowSpans].sort(compareExecutionSpan);
}

export interface EmbeddedChildRunTimelineProps {
  workflowId: string;
  runId?: string;
  parentWorkflowId: string;
  onStepClick: (step: ActivityStep) => void;
  /** Tighter chrome when rendered inside the parent Gantt expand row. */
  variant?: 'standalone' | 'nested';
}

/**
 * Inline child workflow timeline under the parent run — keeps context on the parent page.
 */
export function EmbeddedChildRunTimeline({
  workflowId,
  runId,
  parentWorkflowId,
  onStepClick,
  variant = 'standalone',
}: EmbeddedChildRunTimelineProps) {
  const [parsed, setParsed] = useState<ParsedHistory | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void (async () => {
      try {
        const raw = await getHistory(workflowId, runId?.trim() ? { runId: runId.trim() } : undefined);
        if (cancelled) return;
        setParsed(parseFullHistory(raw));
      } catch (e) {
        if (!cancelled) {
          setParsed(null);
          setErr(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workflowId, runId]);

  const merged = useMemo(() => (parsed ? mergedSpansForChild(parsed) : []), [parsed]);

  /** Omit SDK hook activity from the list; it is rarely useful here and matches agent trace handling. */
  const activityStepsForList = useMemo(
    () => (parsed ? parsed.activitySteps.filter((s) => s.activityName !== 'runLifecycleHooks') : []),
    [parsed],
  );
  const onlyHiddenLifecycle =
    !!parsed &&
    parsed.activitySteps.length > 0 &&
    activityStepsForList.length === 0 &&
    parsed.activitySteps.every((s) => s.activityName === 'runLifecycleHooks');

  const fullHref = runDetailHref(workflowId, runId?.trim() ? { runId: runId.trim() } : undefined);

  return (
    <div
      className={cn(
        'rounded-md border',
        variant === 'nested'
          ? 'border-border/50 bg-card/30 p-2 shadow-none'
          : 'border-border bg-card/40 mt-3 p-3 shadow-inner',
      )}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 font-mono text-[11px] text-muted-foreground">
          <span className="text-foreground/80">Child workflow</span>{' '}
          <span className="truncate text-chart-3">{workflowId}</span>
          {runId?.trim() ? (
            <span className="ml-2 text-muted-foreground/80">
              run <span className="text-foreground/70">{runId.trim()}</span>
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 font-mono text-[10px]" asChild>
            <Link to={fullHref}>Open full page</Link>
          </Button>
        </div>
      </div>

      {loading && <p className="text-muted-foreground font-mono text-xs">Loading child history…</p>}
      {err && <p className="text-destructive font-mono text-xs">{err}</p>}

      {!loading && parsed && (
        <div className="space-y-3">
          {merged.length > 0 ||
          parsed.historyStartMs != null ||
          parsed.activitySteps.length > 0 ? (
            <>
              {merged.length > 0 && (
                <EventHistoryGantt
                  spans={merged}
                  historyStartMs={parsed.historyStartMs}
                  historyEndMs={parsed.historyEndMs}
                  anchorStartMs={null}
                  anchorCloseMs={null}
                  isRunning={false}
                  timelineTitle="Child: activities & nested children"
                  onSpanClick={(span) => {
                    const step = parsed.activitySteps.find((s) => s.eventId === span.key);
                    if (step) onStepClick(step);
                  }}
                  isSpanClickable={(span) => parsed.activitySteps.some((s) => s.eventId === span.key)}
                />
              )}
              {onlyHiddenLifecycle ? (
                <p className="text-muted-foreground font-mono text-[11px] leading-relaxed">
                  History only includes <span className="text-foreground/80">runLifecycleHooks</span> (Durion SDK
                  hooks)—not model/tool work. If you expected more activities, the run may still be in progress, or
                  open the full page and use the Events tab for every Temporal event.
                </p>
              ) : activityStepsForList.length > 0 ? (
                <ActivityList
                  steps={activityStepsForList}
                  onStepClick={onStepClick}
                  className={variant === 'nested' ? 'max-h-52' : undefined}
                />
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground font-mono text-xs">No activity rows in child history yet.</p>
          )}
        </div>
      )}

      <p className="text-muted-foreground/70 mt-2 font-mono text-[10px]">
        Parent run: <span className="text-muted-foreground">{parentWorkflowId}</span>
      </p>
    </div>
  );
}
