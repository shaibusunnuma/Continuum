import type { ActivityStep } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';

export function ActivityList({ steps, onStepClick }: { steps: ActivityStep[]; onStepClick?: (step: ActivityStep) => void }) {
  if (steps.length === 0) {
    return (
      <p className="text-muted-foreground font-mono text-sm">
        No activity tasks found in history (or history unavailable).
      </p>
    );
  }

  return (
    <ScrollArea className="h-[min(70vh,560px)] rounded-md border border-border">
      <ol className="space-y-0 divide-y divide-border font-mono text-sm">
        {steps.map((s, i) => (
          <li 
            key={`${s.eventId}-${i}`} 
            className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => onStepClick?.(s)}
          >
            <span className="text-muted-foreground w-8 shrink-0 text-right tabular-nums">{i + 1}</span>
            <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="truncate text-foreground">{s.activityName}</div>
              <div className="text-muted-foreground text-xs">event {s.eventId}</div>
            </div>
          </li>
        ))}
      </ol>
    </ScrollArea>
  );
}
