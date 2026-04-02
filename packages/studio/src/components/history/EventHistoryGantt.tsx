import { useMemo, type CSSProperties } from 'react';
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

function formatWallClock(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '—';
  }
}

const HANDOFF_MAX_GAP_MS = 200;

type EnrichedSpan = ActivitySpan & {
  execStart: number;
  execEndResolved: number;
};

function enrichSpan(s: ActivitySpan, isRunning: boolean | undefined, now: number): EnrichedSpan {
  const execEnd =
    s.endedAt ??
    (isRunning && (s.outcome === 'running' || (s.startedAt && !s.endedAt)) ? now : null);

  const execStart = s.startedAt ?? s.scheduledAt;
  const execEndResolved =
    execEnd ?? (isRunning && s.startedAt ? now : execStart);

  return { ...s, execStart, execEndResolved };
}

/** Times where one activity ended and the next started within HANDOFF_MAX_GAP_MS (Temporal-style handoff). */
function handoffBoundaryTimes(spans: EnrichedSpan[]): number[] {
  const set = new Set<number>();
  for (const a of spans) {
    if (a.endedAt == null) continue;
    let bestGap = Infinity;
    for (const b of spans) {
      if (b.key === a.key || b.startedAt == null) continue;
      const gap = b.startedAt - a.endedAt;
      if (gap < 0 || gap >= bestGap) continue;
      bestGap = gap;
    }
    if (bestGap <= HANDOFF_MAX_GAP_MS) set.add(a.endedAt);
  }
  return [...set].sort((x, y) => x - y);
}

/** Vertical grid + handoff guides spanning the whole timeline column. */
function TimelineColumnOverlay({
  handoffAtMs,
  t0,
  duration,
}: {
  handoffAtMs: number[];
  t0: number;
  duration: number;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[1]">
      {[0, 25, 50, 75].map((p) => (
        <div
          key={p}
          className="absolute top-0 bottom-0 w-px bg-border/45"
          style={{ left: `${p}%` }}
        />
      ))}
      <div className="absolute top-0 right-0 bottom-0 w-px bg-border/45" />
      {handoffAtMs.map((tMs) => (
        <div
          key={tMs}
          className="absolute top-0 bottom-0 w-px bg-primary/55"
          style={{
            left: `${((tMs - t0) / duration) * 100}%`,
            transform: 'translateX(-50%)',
          }}
          title="Activity handoff (one ended → next started)"
        />
      ))}
    </div>
  );
}

function BarEndMarkers({
  startPct,
  endPct,
  outcome,
  isRunningBar,
}: {
  startPct: number;
  endPct: number;
  outcome: ActivitySpan['outcome'];
  isRunningBar: boolean;
}) {
  const endRing = cn(
    'pointer-events-none absolute top-1/2 z-[3] size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border',
    outcome === 'failed' || outcome === 'timed_out'
      ? 'border-destructive bg-destructive/85'
      : outcome === 'canceled'
        ? 'border-muted-foreground bg-muted-foreground/55'
        : isRunningBar || outcome === 'running'
          ? 'border-primary bg-primary'
          : 'border-primary/80 bg-primary/90',
  );
  return (
    <>
      <div
        className="pointer-events-none absolute top-1/2 z-[3] size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-muted-foreground/50 bg-muted-foreground/35"
        style={{ left: `${startPct}%` }}
        title="Started"
      />
      <div className={endRing} style={{ left: `${endPct}%` }} title="Ended (or now)" />
    </>
  );
}

interface Props {
  spans: ActivitySpan[];
  historyStartMs: number | null;
  historyEndMs: number | null;
  /**
   * Execution start/close from Temporal describe (ms). Fills the timeline when history events
   * lack parseable times or no worker has produced activity rows yet.
   */
  anchorStartMs?: number | null;
  anchorCloseMs?: number | null;
  /** When true, running activities extend to "now" and the window uses Date.now() as end. */
  isRunning?: boolean;
  /** Activity rows only; opens detail (e.g. X-Ray) for the matching scheduled event. */
  onSpanClick?: (span: ActivitySpan) => void;
  /** With `onSpanClick`, limit which rows look/behave clickable (e.g. only spans with an activity list step). */
  isSpanClickable?: (span: ActivitySpan) => boolean;
  /** Heading above the timeline (default: activity timeline). */
  timelineTitle?: string;
}

export function EventHistoryGantt({
  spans,
  historyStartMs,
  historyEndMs,
  anchorStartMs,
  anchorCloseMs,
  isRunning,
  onSpanClick,
  isSpanClickable,
  timelineTitle = 'Activity timeline',
}: Props) {
  const now = Date.now();
  const times = spans.flatMap((s) => [s.scheduledAt, s.startedAt, s.endedAt].filter((x): x is number => x != null));
  const spanMin = times.length ? Math.min(...times) : null;
  const spanMax = times.length ? Math.max(...times) : null;

  let t0 =
    historyStartMs ??
    spanMin ??
    (spans[0]?.scheduledAt ?? null) ??
    (anchorStartMs ?? null);
  let t1Raw =
    historyEndMs ??
    spanMax ??
    (spans[spans.length - 1]?.endedAt ?? spans[spans.length - 1]?.scheduledAt ?? null) ??
    (anchorCloseMs ?? null);

  // History bounds can collapse to ~1ms when activity `eventTime` wasn't parsed; spans still carry real instants.
  if (
    spanMin != null &&
    spanMax != null &&
    spanMax > spanMin &&
    t0 != null &&
    t1Raw != null &&
    t1Raw - t0 <= 1
  ) {
    t0 = spanMin;
    t1Raw = spanMax;
  } else if (
    spanMin != null &&
    spanMax != null &&
    spanMax > spanMin &&
    t0 != null &&
    t1Raw != null
  ) {
    if (spanMin < t0) t0 = spanMin;
    if (spanMax > t1Raw) t1Raw = spanMax;
  }

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

  const tickLabels = [0, 0.25, 0.5, 0.75, 1].map((f) => formatDuration(duration * f));

  const sortedEnriched = useMemo(() => {
    const enriched = spans.map((s) => enrichSpan(s, isRunning, now));
    return [...enriched].sort((a, b) => {
      if (a.execStart !== b.execStart) return a.execStart - b.execStart;
      return a.key.localeCompare(b.key);
    });
  }, [spans, isRunning, now]);

  const handoffAtMs = useMemo(
    () => handoffBoundaryTimes(sortedEnriched),
    [sortedEnriched],
  );

  const workflowAwaitingProgress = sortedEnriched.length === 0 && !!isRunning;
  const pendingBarStyle: CSSProperties | undefined = workflowAwaitingProgress
    ? {
        backgroundImage: `repeating-linear-gradient(
          90deg,
          color-mix(in oklch, var(--primary) 52%, transparent) 0px,
          color-mix(in oklch, var(--primary) 52%, transparent) 3px,
          color-mix(in oklch, var(--primary) 16%, transparent) 3px,
          color-mix(in oklch, var(--primary) 16%, transparent) 6px
        )`,
      }
    : undefined;

  return (
    <div className="rounded-md border border-border bg-card/30 p-4 font-mono text-xs">
      {workflowAwaitingProgress && (
        <p className="text-muted-foreground mb-2 text-[10px] leading-snug">
          No activity tasks in history yet — the workflow is live on the server but no worker has
          advanced it (compare Temporal&apos;s hatched workflow bar).
        </p>
      )}
      <div className="text-muted-foreground mb-2 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <span className="text-foreground">{timelineTitle}</span>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 tabular-nums text-[10px] text-muted-foreground/85">
          <span>
            {formatWallClock(t0)} → {formatWallClock(t1)}
          </span>
          <span>{formatDuration(duration)} span</span>
        </div>
      </div>

      <div className="mb-1 grid grid-cols-[minmax(0,9rem)_1fr] gap-x-2">
        <div />
        <div className="text-muted-foreground/60 flex justify-between text-[10px] tabular-nums">
          {tickLabels.map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-x-2">
          <div
            className="flex min-h-3 items-center truncate text-muted-foreground"
            title={
              workflowAwaitingProgress
                ? 'Execution started; waiting for a worker to process workflow / activity tasks'
                : 'Workflow execution window'
            }
          >
            {workflowAwaitingProgress ? 'Workflow (pending)' : 'Workflow'}
          </div>
          <div className="relative h-3 min-w-0 overflow-hidden rounded bg-secondary/40">
            <TimelineColumnOverlay handoffAtMs={handoffAtMs} t0={t0} duration={duration} />
            <div
              className={cn(
                'absolute inset-y-0.5 left-0 right-0 z-[2] rounded-sm',
                !workflowAwaitingProgress && 'bg-primary/35',
              )}
              style={pendingBarStyle}
            />
          </div>
        </div>

        {sortedEnriched.map((s) => {
          const execEnd =
            s.endedAt ??
            (isRunning && (s.outcome === 'running' || (s.startedAt && !s.endedAt)) ? now : null);

          const execStart = s.startedAt ?? s.scheduledAt;
          const execEndResolved =
            execEnd ?? (isRunning && s.startedAt ? now : execStart);

          const color =
            s.outcome === 'failed' || s.outcome === 'timed_out'
              ? 'bg-destructive/70'
              : s.outcome === 'canceled'
                ? 'bg-muted-foreground/50'
                : s.outcome === 'running' || (isRunning && !s.endedAt && s.startedAt)
                  ? 'animate-pulse bg-primary'
                  : 'bg-primary/80';

          const showScheduleWait =
            s.startedAt != null && s.scheduledAt < s.startedAt;

          const handleActivate = () => {
            onSpanClick?.(s);
          };

          const rowClickable =
            !!onSpanClick && (isSpanClickable?.(s) ?? true);

          const isRunningBar = !!(isRunning && !s.endedAt && s.startedAt);
          const startP = pct(execStart);
          const endP = pct(Math.max(execEndResolved, execStart));

          const dup = spans.filter((x) => x.activityName === s.activityName).length > 1;
          const rowLabel = dup ? `${s.activityName} (#${s.key})` : s.activityName;

          return (
            <div
              key={s.key}
              role={rowClickable ? 'button' : undefined}
              tabIndex={rowClickable ? 0 : undefined}
              onClick={rowClickable ? handleActivate : undefined}
              onKeyDown={
                rowClickable
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleActivate();
                      }
                    }
                  : undefined
              }
              className={cn(
                'grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-x-2 rounded-md',
                rowClickable &&
                  'ring-offset-background cursor-pointer hover:bg-secondary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <div
                className="text-muted-foreground flex min-h-3 min-w-0 items-center truncate py-0.5 pr-1"
                title={rowLabel}
              >
                {rowLabel}
              </div>
              <div className="relative z-[2] h-3 min-w-0 overflow-hidden rounded bg-secondary/40">
                <TimelineColumnOverlay handoffAtMs={handoffAtMs} t0={t0} duration={duration} />
                {showScheduleWait && (
                  <div
                    className="absolute top-0.5 z-[2] h-2 rounded-sm border border-dashed border-muted-foreground/35 bg-muted-foreground/20"
                    style={{
                      left: `${pct(s.scheduledAt)}%`,
                      width: `${widthPct(s.scheduledAt, s.startedAt!)}%`,
                    }}
                    title="Queued / waiting to start"
                  />
                )}
                <div
                  className={cn('absolute top-0.5 z-[2] h-2 rounded-sm', color)}
                  style={{
                    left: `${startP}%`,
                    width: `${widthPct(execStart, Math.max(execEndResolved, execStart))}%`,
                  }}
                />
                <BarEndMarkers
                  startPct={startP}
                  endPct={endP}
                  outcome={s.outcome}
                  isRunningBar={isRunningBar}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
