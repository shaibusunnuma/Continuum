import type { ReactNode } from 'react';
import type { ActivitySpan } from '@/lib/types';
import { cn } from '@/lib/utils';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(2)}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r.toFixed(0)}s`;
}

interface Props {
  spans: ActivitySpan[];
  historyStartMs: number | null;
  historyEndMs: number | null;
  /** When true, running activities extend to "now" and the window uses Date.now() as end. */
  isRunning?: boolean;
}

export function EventHistoryGantt({ spans, historyStartMs, historyEndMs, isRunning }: Props) {
  const now = Date.now();
  const times = spans.flatMap((s) => [s.scheduledAt, s.startedAt, s.endedAt].filter((x): x is number => x != null));
  const t0 =
    historyStartMs ??
    (times.length ? Math.min(...times) : null) ??
    (spans[0]?.scheduledAt ?? null);
  const t1Raw =
    historyEndMs ??
    (times.length ? Math.max(...times) : null) ??
    (spans[spans.length - 1]?.endedAt ?? spans[spans.length - 1]?.scheduledAt ?? null);

  if (t0 == null) {
    return (
      <p className="text-muted-foreground font-mono text-sm">
        No activity timing data in history yet.
      </p>
    );
  }

  const t1 = isRunning ? Math.max(t1Raw ?? t0, now) : (t1Raw ?? t0);
  const duration = Math.max(t1 - t0, 1);

  const pct = (ms: number) => ((ms - t0) / duration) * 100;
  const widthPct = (a: number, b: number) => Math.max(((b - a) / duration) * 100, 0.35);

  return (
    <div className="rounded-md border border-border bg-card/30 p-4 font-mono text-xs">
      <div className="text-muted-foreground mb-3 flex items-center justify-between">
        <span className="text-foreground">Activity timeline</span>
        <span className="tabular-nums">
          {formatDuration(duration)} total
        </span>
      </div>

      {/* X-axis ticks (simplified) */}
      <div className="text-muted-foreground/60 mb-1 flex justify-between pl-[min(40%,9rem)] text-[10px] tabular-nums">
        <span>0</span>
        <span>{formatDuration(duration * 0.25)}</span>
        <span>{formatDuration(duration * 0.5)}</span>
        <span>{formatDuration(duration * 0.75)}</span>
        <span>{formatDuration(duration)}</span>
      </div>

      <div className="space-y-2">
        {/* Full workflow span (matches Temporal “whole run” bar) */}
        <GanttRow
          label="Workflow"
          track={
            <div className="absolute inset-y-0.5 left-0 right-0 rounded-sm bg-primary/35" />
          }
        />

        {spans.map((s) => {
          const start = s.startedAt ?? s.scheduledAt;
          const end =
            s.endedAt ??
            (isRunning && (s.outcome === 'running' || (s.startedAt && !s.endedAt)) ? now : start);
          const color =
            s.outcome === 'failed' || s.outcome === 'timed_out'
              ? 'bg-destructive/70'
              : s.outcome === 'canceled'
                ? 'bg-muted-foreground/50'
                : s.outcome === 'running' || (isRunning && !s.endedAt && s.startedAt)
                  ? 'animate-pulse bg-primary'
                  : 'bg-emerald-600/80';

          const dup = spans.filter((x) => x.activityName === s.activityName).length > 1;
          const label = dup ? `${s.activityName} (#${s.key})` : s.activityName;

          return (
            <GanttRow
              key={s.key}
              label={label}
              track={
                <div
                  className={cn('absolute top-0.5 h-2 rounded-sm', color)}
                  style={{
                    left: `${pct(start)}%`,
                    width: `${widthPct(start, Math.max(end, start))}%`,
                  }}
                />
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function GanttRow({ label, track }: { label: string; track: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-2">
      <div className="truncate text-muted-foreground" title={label}>
        {label}
      </div>
      <div className="relative h-3 rounded bg-secondary/40">{track}</div>
    </div>
  );
}
