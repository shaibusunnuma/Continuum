import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { describeRun, getHistory, getStreamState } from '@/lib/api';
import { parseActivityStepsFromHistory } from '@/lib/parse-history';
import { detectViewMode } from '@/lib/view-mode';
import type { GraphStreamState, StreamState } from '@/lib/types';
import { GraphCanvas } from '@/components/graph/GraphCanvas';
import { AgentTimeline } from '@/components/agent/AgentTimeline';
import { ActivityList } from '@/components/workflow/ActivityList';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';

export function RunDetail() {
  const { workflowId: workflowIdParam } = useParams<{ workflowId: string }>();
  const workflowId = workflowIdParam ? decodeURIComponent(workflowIdParam) : '';

  const [streamState, setStreamState] = useState<StreamState | GraphStreamState | null>(null);
  const [describe, setDescribe] = useState<{
    status: string;
    type: unknown;
    startTime: string | null;
    closeTime: string | null;
  } | null>(null);
  const [activitySteps, setActivitySteps] = useState(() => parseActivityStepsFromHistory(null));
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const historyLoaded = useRef(false);

  useEffect(() => {
    historyLoaded.current = false;
  }, [workflowId]);

  const loadHistoryIfWorkflow = useCallback(
    async (s: StreamState) => {
      if (detectViewMode(s) !== 'workflow') return;
      if (historyLoaded.current) return;
      historyLoaded.current = true;
      try {
        const hist = await getHistory(workflowId);
        setActivitySteps(parseActivityStepsFromHistory(hist));
      } catch {
        setActivitySteps([]);
      }
    },
    [workflowId],
  );

  const fullRefresh = useCallback(async () => {
    if (!workflowId) {
      setRefreshing(false);
      return;
    }
    setError(null);
    setRefreshing(true);
    historyLoaded.current = false;
    try {
      const [descResult, streamResult] = await Promise.allSettled([
        describeRun(workflowId),
        getStreamState(workflowId),
      ]);

      const errs: string[] = [];
      if (descResult.status === 'fulfilled') {
        const d = descResult.value;
        setDescribe({
          status: d.status,
          type: d.type,
          startTime: d.startTime,
          closeTime: d.closeTime,
        });
      } else {
        const r = descResult.reason;
        errs.push(r instanceof Error ? r.message : String(r));
      }

      if (streamResult.status === 'fulfilled') {
        const s = streamResult.value;
        setStreamState(s);
        void loadHistoryIfWorkflow(s);
      } else {
        setStreamState(null);
        const r = streamResult.reason;
        errs.push(r instanceof Error ? r.message : String(r));
      }

      setError(errs.length ? errs.join(' · ') : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, [workflowId, loadHistoryIfWorkflow]);

  const pollStream = useCallback(async () => {
    if (!workflowId) return;
    try {
      const [d, s] = await Promise.all([describeRun(workflowId), getStreamState(workflowId)]);
      setDescribe({
        status: d.status,
        type: d.type,
        startTime: d.startTime,
        closeTime: d.closeTime,
      });
      setStreamState(s);
    } catch {
      /* ignore transient poll errors */
    }
  }, [workflowId]);

  useEffect(() => {
    void fullRefresh();
  }, [fullRefresh]);

  useEffect(() => {
    if (!streamState || streamState.status !== 'running') return;
    const t = window.setInterval(() => {
      void pollStream();
    }, 1500);
    return () => window.clearInterval(t);
  }, [streamState?.status, pollStream]);

  const mode = streamState ? detectViewMode(streamState) : null;
  const typeLabel = (() => {
    const t = describe?.type;
    if (t == null) return '—';
    if (typeof t === 'string') return t;
    if (typeof t === 'object' && t !== null && 'name' in t && typeof (t as { name: unknown }).name === 'string') {
      return (t as { name: string }).name;
    }
    return JSON.stringify(t);
  })();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b border-border px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="min-w-0 flex-1 font-mono text-sm">
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              runs
            </Link>
            <span className="text-muted-foreground"> / </span>
            <span className="truncate text-foreground" title={workflowId}>
              {workflowId || '…'}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="font-mono text-xs">
                  {'</>'}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full border-border sm:max-w-lg">
                <SheetHeader>
                  <SheetTitle className="font-mono text-sm">stream-state</SheetTitle>
                  <SheetDescription className="font-mono text-xs">
                    Latest <code className="text-foreground">durion:streamState</code> query payload.
                  </SheetDescription>
                </SheetHeader>
                <ScrollArea className="mt-4 h-[calc(100vh-8rem)] rounded-md border border-border p-3">
                  <pre className="font-mono text-[11px] whitespace-pre-wrap wrap-break-word text-muted-foreground">
                    {streamState ? JSON.stringify(streamState, null, 2) : 'Loading…'}
                  </pre>
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6">
        {error && (
          <p className="text-destructive font-mono text-sm" role="alert">
            {error}
          </p>
        )}

        <Card className="border-border">
          <CardHeader className="py-4">
            <CardTitle className="font-mono text-sm font-normal text-foreground">Run</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 font-mono text-xs sm:grid-cols-2">
            <div>
              <div className="text-muted-foreground">Type</div>
              <div className="text-foreground">{typeLabel}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Status</div>
              <div className="flex items-center gap-2">
                {describe ? (
                  <Badge variant="outline" className="rounded-sm font-mono text-[10px]">
                    {describe.status}
                  </Badge>
                ) : (
                  <span className="text-foreground">—</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">View</div>
              <div className="text-foreground">{mode ?? '—'}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Updated</div>
              <div className="text-muted-foreground">
                {streamState?.updatedAt ? new Date(streamState.updatedAt).toLocaleString() : '—'}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="min-h-[420px] flex-1">
          {refreshing && !streamState && !error && (
            <p className="text-muted-foreground font-mono text-sm">Loading stream state…</p>
          )}
          {streamState && mode === 'graph' && (
            <GraphCanvas state={streamState as GraphStreamState} />
          )}
          {streamState && mode === 'agent' && <AgentTimeline state={streamState} />}
          {streamState && mode === 'workflow' && <ActivityList steps={activitySteps} />}
        </div>
      </main>
    </div>
  );
}
