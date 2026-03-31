import { Link } from 'react-router';
import type { ChildWorkflowStep } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function outcomeBadgeClass(outcome: ChildWorkflowStep['outcome']): string {
  switch (outcome) {
    case 'completed':
      return 'border-primary/35 bg-primary/10 text-primary';
    case 'running':
    case 'pending':
      return 'border-warning/35 bg-warning/10 text-warning';
    case 'canceled':
      return 'border-border bg-muted text-muted-foreground';
    case 'timed_out':
    case 'failed':
    case 'terminated':
    case 'start_failed':
      return 'border-destructive/35 bg-destructive/10 text-destructive';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
}

export function ChildWorkflowList({
  steps,
}: {
  steps: ChildWorkflowStep[];
}) {
  if (steps.length === 0) return null;

  return (
    <ScrollArea className="max-h-[min(40vh,320px)] rounded-md border border-border">
      <ol className="divide-y divide-border font-mono text-sm">
        {steps.map((s, i) => (
          <li key={s.initiatedEventId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground w-8 shrink-0 text-right tabular-nums">{i + 1}</span>
                <span className="text-foreground font-medium">{s.workflowType}</span>
                <Badge variant="outline" className={cn('text-[10px] uppercase', outcomeBadgeClass(s.outcome))}>
                  {s.outcome.replace(/_/g, ' ')}
                </Badge>
              </div>
              <div className="text-muted-foreground pl-10 text-xs break-all" title={s.workflowId}>
                <span className="text-muted-foreground/80">workflowId</span> {s.workflowId}
              </div>
              {s.runId ? (
                <div className="text-muted-foreground pl-10 text-[11px] break-all" title={s.runId}>
                  <span className="text-muted-foreground/80">runId</span> {s.runId}
                </div>
              ) : null}
            </div>
            <div className="shrink-0 pl-10 sm:pl-0">
              <Link
                to={`/runs/${encodeURIComponent(s.workflowId)}`}
                className="text-chart-1 text-xs underline-offset-2 hover:underline"
              >
                Open run
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </ScrollArea>
  );
}
