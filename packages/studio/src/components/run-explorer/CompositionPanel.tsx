import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { GitBranch, Layers } from 'lucide-react';
import { listRuns, runDetailHref } from '@/lib/api';
import { usageFromDurionMemo } from '@/lib/memo-usage';
import type { ChildWorkflowStep, StudioRunRow } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface CompositionDescribeSlice {
  runId: string | null;
  parentWorkflowId: string | null;
  parentRunId: string | null;
  rootWorkflowId: string | null;
  rootRunId: string | null;
  memo: Record<string, unknown>;
  startTime: string | null;
  closeTime: string | null;
  status: string;
}

function durationMs(
  start: string | null,
  close: string | null,
  status: string,
): number | null {
  if (!start) return null;
  const a = Date.parse(start);
  if (!Number.isFinite(a)) return null;
  const end = status === 'RUNNING' ? Date.now() : close ? Date.parse(close) : null;
  if (end == null || !Number.isFinite(end)) return null;
  return Math.max(0, end - a);
}

function formatDurationMs(ms: number | null): string {
  if (ms == null) return '—';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function formatUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
}

function formatTokens(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

function childrenOfParentExecution(
  rows: StudioRunRow[],
  parentWorkflowId: string,
  parentRunId: string | null | undefined,
): StudioRunRow[] {
  return rows.filter((r) => {
    if (r.parentWorkflowId !== parentWorkflowId) return false;
    if (!parentRunId) return true;
    if (!r.parentRunId) return true;
    return r.parentRunId === parentRunId;
  });
}

function LineageLink({
  label,
  wfId,
  runId,
  muted,
}: {
  label: string;
  wfId: string;
  runId: string | null | undefined;
  muted?: boolean;
}) {
  return (
    <div className={cn('flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5', muted && 'opacity-90')}>
      <span className="text-muted-foreground shrink-0">{label}</span>
      <Link
        to={runDetailHref(wfId, runId ? { runId } : undefined)}
        className="text-chart-1 min-w-0 truncate hover:underline"
        title={runId ? `${wfId} · ${runId}` : wfId}
      >
        {wfId}
      </Link>
    </div>
  );
}

export function CompositionPanel({
  workflowId,
  describe,
  historyChildSteps,
}: {
  workflowId: string;
  describe: CompositionDescribeSlice | null;
  historyChildSteps: ChildWorkflowStep[];
}) {
  const [visibilityChildren, setVisibilityChildren] = useState<StudioRunRow[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(false);
  const [childrenError, setChildrenError] = useState<string | null>(null);

  useEffect(() => {
    if (!workflowId) {
      setVisibilityChildren([]);
      return;
    }
    let cancelled = false;
    setChildrenLoading(true);
    setChildrenError(null);
    void listRuns({ parentWorkflowId: workflowId, limit: 50 })
      .then(({ runs }) => {
        if (cancelled) return;
        setVisibilityChildren(runs);
      })
      .catch((e) => {
        if (cancelled) return;
        setChildrenError(e instanceof Error ? e.message : String(e));
        setVisibilityChildren([]);
      })
      .finally(() => {
        if (!cancelled) setChildrenLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workflowId]);

  const filteredChildren = useMemo(
    () => childrenOfParentExecution(visibilityChildren, workflowId, describe?.runId),
    [visibilityChildren, workflowId, describe?.runId],
  );

  const showPanel =
    describe &&
    (Boolean(describe.parentWorkflowId) ||
      Boolean(describe.rootWorkflowId && describe.rootWorkflowId !== workflowId) ||
      filteredChildren.length > 0 ||
      childrenLoading ||
      childrenError ||
      historyChildSteps.length > 0);

  const selfUsage = describe ? usageFromDurionMemo(describe.memo) : { totalTokens: null, costUsd: null };
  const selfDuration = describe
    ? durationMs(describe.startTime, describe.closeTime, describe.status)
    : null;

  const rollup = useMemo(() => {
    let costSum = 0;
    let costCount = 0;
    let tokSum = 0;
    let tokCount = 0;
    let durSum = 0;
    let durCount = 0;

    if (selfUsage.costUsd != null) {
      costSum += selfUsage.costUsd;
      costCount += 1;
    }
    if (selfUsage.totalTokens != null) {
      tokSum += selfUsage.totalTokens;
      tokCount += 1;
    }
    if (selfDuration != null) {
      durSum += selfDuration;
      durCount += 1;
    }

    for (const c of filteredChildren) {
      if (c.costUsd != null && Number.isFinite(c.costUsd)) {
        costSum += c.costUsd;
        costCount += 1;
      }
      if (c.totalTokens != null && Number.isFinite(c.totalTokens)) {
        tokSum += c.totalTokens;
        tokCount += 1;
      }
      const d = durationMs(c.startTime, c.closeTime, c.status);
      if (d != null) {
        durSum += d;
        durCount += 1;
      }
    }

    const hasRollup = costCount > 0 || tokCount > 0 || durCount > 0;
    return {
      hasRollup,
      costSum: costCount ? costSum : null,
      costCount,
      tokSum: tokCount ? tokSum : null,
      tokCount,
      durSum: durCount ? durSum : null,
      durCount,
    };
  }, [filteredChildren, selfUsage.costUsd, selfUsage.totalTokens, selfDuration]);

  if (!showPanel || !describe) return null;

  return (
    <Card className="border-border py-0">
      <CardContent className="space-y-3 p-3 font-mono text-[10px] leading-tight">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Layers className="size-3.5 shrink-0 text-chart-1" aria-hidden />
          <span className="tracking-wide uppercase">Composition</span>
        </div>

        <div className="space-y-1.5 border-b border-border pb-3">
          <p className="text-muted-foreground/90 text-[9px] uppercase tracking-wide">Lineage</p>
          {describe.rootWorkflowId &&
          describe.rootWorkflowId !== workflowId &&
          describe.rootWorkflowId !== describe.parentWorkflowId ? (
            <LineageLink label="Root" wfId={describe.rootWorkflowId} runId={describe.rootRunId} />
          ) : null}
          {describe.parentWorkflowId ? (
            <LineageLink
              label="Parent"
              wfId={describe.parentWorkflowId}
              runId={describe.parentRunId}
            />
          ) : (
            <p className="text-muted-foreground">Root run (no parent workflow)</p>
          )}
        </div>

        {rollup.hasRollup && (
          <div className="space-y-1 border-b border-border pb-3">
            <p className="text-muted-foreground/90 text-[9px] uppercase tracking-wide">
              Roll-up (this run + matching children)
            </p>
            <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-3">
              <div>
                <span className="text-muted-foreground">Cost </span>
                <span className="text-foreground">{formatUsd(rollup.costSum)}</span>
                {rollup.costCount > 0 && (
                  <span className="text-muted-foreground/70"> · {rollup.costCount} with data</span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Tokens </span>
                <span className="text-foreground">{formatTokens(rollup.tokSum)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Σ wall time </span>
                <span className="text-foreground">{formatDurationMs(rollup.durSum)}</span>
                {rollup.durCount > 0 && (
                  <span className="text-muted-foreground/70"> · {rollup.durCount} runs</span>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground/90 text-[9px] uppercase tracking-wide">
              Child executions
            </p>
            {childrenLoading && (
              <span className="text-muted-foreground/80 normal-case">Loading…</span>
            )}
          </div>
          {childrenError && (
            <p className="text-destructive text-[10px] normal-case" role="alert">
              {childrenError}
            </p>
          )}
          {!childrenLoading && !childrenError && filteredChildren.length === 0 && (
            <p className="text-muted-foreground normal-case">
              No child workflows in visibility for this id
              {describe.runId ? ' and parent run' : ''}.
            </p>
          )}
          {filteredChildren.length > 0 && (
            <ul className="max-h-[min(40vh,240px)] space-y-1.5 overflow-y-auto pr-1">
              {filteredChildren.map((c) => (
                <li
                  key={`${c.workflowId}-${c.runId}`}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/60 pb-1.5 last:border-0 last:pb-0"
                >
                  <GitBranch className="size-3 shrink-0 text-chart-1/90" aria-hidden />
                  <Link
                    to={runDetailHref(c.workflowId, { runId: c.runId })}
                    className="text-chart-1 min-w-0 max-w-[min(100%,14rem)] truncate hover:underline"
                    title={c.workflowId}
                  >
                    {c.workflowId}
                  </Link>
                  <Badge variant="outline" className="rounded-sm font-mono text-[9px]">
                    {c.workflowType}
                  </Badge>
                  <span className="text-muted-foreground">{c.status}</span>
                  {c.costUsd != null && (
                    <span className="text-muted-foreground">{formatUsd(c.costUsd)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {/* {historyChildSteps.length > 0 && (
            <p className="text-muted-foreground/85 border-t border-border pt-2 text-[9px] leading-snug normal-case">
              <span className="font-medium text-muted-foreground">History: </span>
              {historyChildSteps.length} child workflow start{historyChildSteps.length === 1 ? '' : 's'}{' '}
              in this run&apos;s event timeline
              {filteredChildren.length > 0 ? ' (visibility may differ if ids repeat).' : '.'} Durion uses
              Temporal child workflows for both <code className="text-foreground/90">ctx.run()</code> and
              agent <code className="text-foreground/90">delegates</code>.
            </p>
          )} */}
        </div>
      </CardContent>
    </Card>
  );
}
