import type { StreamState } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export function AgentTimeline({ state }: { state: StreamState }) {
  const messages = state.messages ?? [];
  const step = state.currentStep;

  return (
    <div className="flex h-full min-h-[320px] flex-col gap-2">
      {step != null && (
        <div className="text-muted-foreground font-mono text-xs">
          Step <span className="text-foreground">{step}</span>
        </div>
      )}
      <ScrollArea className="h-[min(70vh,560px)] rounded-md border border-border pr-3">
        <div className="flex flex-col gap-3 py-2">
          {messages.length === 0 ? (
            <p className="text-muted-foreground font-mono text-sm">No messages yet.</p>
          ) : (
            messages.map((m, i) => (
              <div
                key={`${m.role}-${i}-${m.toolCallId ?? ''}`}
                className={cn(
                  'flex',
                  m.role === 'user' ? 'justify-start' : 'justify-end',
                )}
              >
                <Card
                  className={cn(
                    'max-w-[min(100%,520px)] border',
                    m.role === 'user' ? 'border-border bg-card' : 'border-border bg-secondary/40',
                  )}
                >
                  <CardContent className="space-y-2 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="rounded-sm font-mono text-[10px] uppercase">
                        {m.role}
                      </Badge>
                      {m.toolName && (
                        <Badge variant="secondary" className="rounded-sm font-mono text-[10px]">
                          {m.toolName}
                        </Badge>
                      )}
                    </div>
                    <pre className="font-mono text-xs whitespace-pre-wrap wrap-break-word text-foreground">
                      {m.content}
                    </pre>
                  </CardContent>
                </Card>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
