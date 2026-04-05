import type { ActivityStep } from '@/lib/types';
import { cn } from '@/lib/utils';

export function ActivityList({
  steps,
  onStepClick,
  className,
}: {
  steps: ActivityStep[];
  onStepClick?: (step: ActivityStep) => void;
  /** Scroll container: defaults to a content-sized box with a max height (avoids huge empty space for few rows). */
  className?: string;
}) {
  if (steps.length === 0) {
    return (
      <p className="text-muted-foreground font-mono text-sm">
        No activity tasks found in history (or history unavailable).
      </p>
    );
  }

  return (
    <div
      className={cn(
        'max-h-[min(45vh,360px)] overflow-y-auto rounded-md border border-border',
        className,
      )}
    >
      <ol className="divide-y divide-border font-mono text-sm">
        {steps.map((s, i) => (
          <li
            key={`${s.eventId}-${i}`}
            className="hover:bg-muted/50 flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors"
            onClick={() => onStepClick?.(s)}
          >
            <span className="text-muted-foreground w-8 shrink-0 text-right tabular-nums">{i + 1}</span>
            <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-foreground truncate">{s.activityName}</div>
              <div className="text-muted-foreground text-xs">event {s.eventId}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
