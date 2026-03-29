import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { describeRun, getHistory, getStreamState } from '@/lib/api';
import { parseFullHistory } from '@/lib/parse-history';
import { detectViewMode } from '@/lib/view-mode';
import type { RunViewMode } from '@/lib/view-mode';
import type { GraphStreamState, ParsedHistory, StreamState } from '@/lib/types';
import { GraphCanvas } from '@/components/graph/GraphCanvas';
import { AgentTimeline } from '@/components/agent/AgentTimeline';
import { ActivityList } from '@/components/workflow/ActivityList';
import { EventTimeline } from '@/components/history/EventTimeline';
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

interface DescribeData {
  status: string;
  type: unknown;
  startTime: string | null;
  closeTime: string | null;
  memo: Record<string, unknown>;
}

const EMPTY_HISTORY: ParsedHistory = {
  events: [],
  input: null,
  result: null,
  memo: {},
  workflowType: null,
  taskQueue: null,
  activitySteps: [],
  executedNodes: null,
  topology: null,
};

export function RunDetail() {
  const { workflowId: workflowIdParam } = useParams<{ workflowId: string }>();
  const workflowId = workflowIdParam ? decodeURIComponent(workflowIdParam) : '';

  // ── Primary: from Temporal server (no worker needed) ───────────────────
  const [describe, setDescribe] = useState<DescribeData | null>(null);
  const [history, setHistory] = useState<ParsedHistory>(EMPTY_HISTORY);

  // ── Optional: from worker query ────────────────────────────────────────
  const [streamState, setStreamState] = useState<StreamState | GraphStreamState | null>(null);
  const [streamAvailable, setStreamAvailable] = useState<boolean | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(true);

  // Active tab for the content area
  const [activeTab, setActiveTab] = useState<'visualization' | 'events' | 'input' | 'result'>('visualization');

  // ── Load everything in parallel ────────────────────────────────────────
  const fullRefresh = useCallback(async () => {
    if (!workflowId) {
      setRefreshing(false);
      return;
    }
    setError(null);
    setRefreshing(true);
    try {
      const [descResult, histResult, streamResult] = await Promise.allSettled([
        describeRun(workflowId),
        getHistory(workflowId),
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
          memo: d.memo ?? {},
        });
      } else {
        const r = descResult.reason;
        errs.push(r instanceof Error ? r.message : String(r));
      }

      if (histResult.status === 'fulfilled') {
        const parsed = parseFullHistory(histResult.value);
        setHistory(parsed);
      } else {
        setHistory(EMPTY_HISTORY);
      }

      if (streamResult.status === 'fulfilled') {
        setStreamState(streamResult.value);
        setStreamAvailable(true);
      } else {
        setStreamState(null);
        setStreamAvailable(false);
      }

      setError(errs.length ? errs.join(' · ') : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, [workflowId]);

  // ── Polling for live runs ──────────────────────────────────────────────
  const pollStream = useCallback(async () => {
    if (!workflowId) return;
    try {
      const [d, s] = await Promise.all([describeRun(workflowId), getStreamState(workflowId)]);
      setDescribe({
        status: d.status,
        type: d.type,
        startTime: d.startTime,
        closeTime: d.closeTime,
        memo: d.memo ?? {},
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
    const t = window.setInterval(() => void pollStream(), 1500);
    return () => window.clearInterval(t);
  }, [streamState?.status, pollStream]);

  // ── View mode: prefer stream-state, fall back to history-derived ───────
  const mode: RunViewMode | null = (() => {
    if (streamState) return detectViewMode(streamState);
    if (history.topology) return 'graph';
    if (history.activitySteps.length > 0) return 'workflow';
    if (describe) return 'workflow';
    return null;
  })();

  const typeLabel = (() => {
    const t = describe?.type ?? history.workflowType;
    if (t == null) return '—';
    if (typeof t === 'string') return t;
    if (typeof t === 'object' && t !== null && 'name' in t && typeof (t as { name: unknown }).name === 'string') {
      return (t as { name: string }).name;
    }
    return JSON.stringify(t);
  })();

  const isLive = streamAvailable === true;
  const isDegraded = streamAvailable === false && !refreshing;

  const hasVisualization = mode === 'graph' || mode === 'agent' || mode === 'workflow';
  const hasEvents = history.events.length > 0;
  const hasInput = history.input != null;
  const hasResult = history.result != null;

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
                    {streamState
                      ? JSON.stringify(streamState, null, 2)
                      : isDegraded
                        ? 'Stream state unavailable (no worker responding to queries).'
                        : 'Loading…'}
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

        {/* ── Run summary card ──────────────────────────────────────── */}
        <Card className="border-border">
          <CardHeader className="py-4">
            <CardTitle className="font-mono text-sm font-normal text-foreground">Run</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 font-mono text-xs sm:grid-cols-2 lg:grid-cols-4">
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
              <div className="text-foreground">
                {mode ?? '—'}
                {isLive && (
                  <span className="text-primary ml-2 text-[10px]">live</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Updated</div>
              <div className="text-muted-foreground">
                {streamState?.updatedAt
                  ? new Date(streamState.updatedAt).toLocaleString()
                  : describe?.closeTime
                    ? new Date(describe.closeTime).toLocaleString()
                    : describe?.startTime
                      ? new Date(describe.startTime).toLocaleString()
                      : '—'}
              </div>
            </div>
          </CardContent>
        </Card>

        {isDegraded && (
          <div className="rounded border border-border bg-secondary/30 px-4 py-2.5 font-mono text-xs text-muted-foreground">
            Live execution state unavailable — showing data from Temporal event history.
            {describe?.status === 'RUNNING' && ' Start a worker for real-time stream updates.'}
          </div>
        )}

        {/* ── Tabs ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 border-b border-border font-mono text-xs">
          {hasVisualization && (
            <TabButton active={activeTab === 'visualization'} onClick={() => setActiveTab('visualization')}>
              {mode === 'graph' ? 'Graph' : mode === 'agent' ? 'Agent' : 'Activities'}
            </TabButton>
          )}
          {hasEvents && (
            <TabButton active={activeTab === 'events'} onClick={() => setActiveTab('events')}>
              Event History
              <span className="text-muted-foreground/60 ml-1">{history.events.length}</span>
            </TabButton>
          )}
          {hasInput && (
            <TabButton active={activeTab === 'input'} onClick={() => setActiveTab('input')}>
              Input
            </TabButton>
          )}
          {hasResult && (
            <TabButton active={activeTab === 'result'} onClick={() => setActiveTab('result')}>
              Result
            </TabButton>
          )}
        </div>

        {/* ── Content ───────────────────────────────────────────────── */}
        <div className="h-[560px] min-h-[420px]">
          {refreshing && !describe && !hasEvents && (
            <p className="text-muted-foreground font-mono text-sm">Loading…</p>
          )}

          {activeTab === 'visualization' && (
            <>
              {/* Graph: live from stream-state OR static from history topology */}
              {mode === 'graph' && streamState && (
                <GraphCanvas state={streamState as GraphStreamState} />
              )}
              {mode === 'graph' && !streamState && history.topology && (
                <GraphCanvas
                  topology={history.topology}
                  executedNodes={history.executedNodes ?? undefined}
                />
              )}

              {/* Agent: only with stream-state; degrade to activity list */}
              {mode === 'agent' && streamState && (
                <AgentTimeline state={streamState} />
              )}
              {mode === 'agent' && !streamState && (
                <ActivityList steps={history.activitySteps} />
              )}

              {/* Workflow: always from history */}
              {mode === 'workflow' && <ActivityList steps={history.activitySteps} />}

              {!mode && !refreshing && (
                <p className="text-muted-foreground font-mono text-sm">
                  No visualization available for this run.
                </p>
              )}
            </>
          )}

          {activeTab === 'events' && (
            <EventTimeline events={history.events} />
          )}

          {activeTab === 'input' && (
            <ScrollArea className="h-[min(70vh,560px)] rounded-md border border-border p-4">
              <pre className="font-mono text-xs whitespace-pre-wrap wrap-break-word text-muted-foreground">
                {JSON.stringify(history.input, null, 2)}
              </pre>
            </ScrollArea>
          )}

          {activeTab === 'result' && (
            <ScrollArea className="h-[min(70vh,560px)] rounded-md border border-border p-4">
              <pre className="font-mono text-xs whitespace-pre-wrap wrap-break-word text-muted-foreground">
                {JSON.stringify(history.result, null, 2)}
              </pre>
            </ScrollArea>
          )}
        </div>
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer border-b-2 px-3 py-2 transition-colors ${
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
