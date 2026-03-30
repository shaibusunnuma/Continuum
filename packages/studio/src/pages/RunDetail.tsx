import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { describeRun, getHistory, getResult, getStreamState } from '@/lib/api';
import { parseFullHistory } from '@/lib/parse-history';
import { detectViewMode } from '@/lib/view-mode';
import type { RunViewMode } from '@/lib/view-mode';
import type { GraphStreamState, ParsedHistory, StreamState } from '@/lib/types';
import { GraphCanvas } from '@/components/graph/GraphCanvas';
import { parseGraphResultSummary, isGraphResultPayload } from '@/lib/graph-result-summary';
import { AgentTimeline } from '@/components/agent/AgentTimeline';
import { ActivityList } from '@/components/workflow/ActivityList';
import { EventHistoryGantt } from '@/components/history/EventHistoryGantt';
import { EventTimeline } from '@/components/history/EventTimeline';
import { XRayPane } from '@/components/ui/XRayPane';
import { CostBreakdown } from '@/components/run-explorer/CostBreakdown';
import type { ActivityStep } from '@/lib/types';
import type { MemoTopology } from '@/lib/view-mode';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  runId: string | null;
  type: unknown;
  /** From Temporal describe (preferred over parsing history). */
  taskQueue: string | null;
  startTime: string | null;
  closeTime: string | null;
  memo: Record<string, unknown>;
}

function formatRunDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms).toLocaleString() : '—';
}

function formatRunDuration(start: string | null, end: string | null): string {
  if (!start || !end) return '—';
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return '—';
  const ms = b - a;
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  const rem = ms % 1000;
  return rem > 0 ? `${s}s ${rem}ms` : `${s}s`;
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
  activitySpans: [],
  historyStartMs: null,
  historyEndMs: null,
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
  /** Workflow return value from `GET .../result` when not running (fills graph tokens/status if history payloads are opaque). */
  const [workflowResultPayload, setWorkflowResultPayload] = useState<unknown>(null);

  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(true);

  // Active tab for the content area
  const [activeTab, setActiveTab] = useState<'visualization' | 'events' | 'input' | 'result' | 'cost'>('visualization');

  // X-Ray Pane State
  const [selectedStep, setSelectedStep] = useState<ActivityStep | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [isXRayOpen, setIsXRayOpen] = useState(false);

  const openXRay = (step: any | null, nodeId?: string) => {
    let targetStep = step;
    
    // If we only have a nodeId (clicked from graph), try to find its corresponding activity step
    if (!step && nodeId && history?.activitySteps) {
      // Traverse backwards so we always show the LATEST execution of a node in loops
      targetStep = [...history.activitySteps].reverse().find(s => {
        // Find by Trace Context if available
        const inputData = Array.isArray(s.input) ? s.input[0] : s.input;
        const traceCtx = (s as any).traceContext || inputData?.traceContext || (s.input && Array.isArray(s.input) ? s.input[1] : null);
        const stepNodeId = traceCtx?.agentName || traceCtx?.['durion:nodeId'];
        
        // Also fallback to activityName matching if needed
        return (stepNodeId && stepNodeId === nodeId) || s.activityName === nodeId;
      });
    }

    setSelectedStep(targetStep || null);
    setSelectedNodeId(nodeId || undefined);
    setIsXRayOpen(true);
  };

  useEffect(() => {
    setStreamState(null);
    setStreamAvailable(null);
  }, [workflowId]);

  // ── Load describe + history first (Temporal server only); stream-state in background (needs worker) ──
  const fullRefresh = useCallback(async () => {
    if (!workflowId) {
      setRefreshing(false);
      return;
    }
    setError(null);
    setRefreshing(true);
    try {
      const [descResult, histResult] = await Promise.allSettled([
        describeRun(workflowId),
        getHistory(workflowId),
      ]);

      const errs: string[] = [];

      if (descResult.status === 'fulfilled') {
        const d = descResult.value;
        setDescribe({
          status: d.status,
          runId: d.runId ?? null,
          type: d.type,
          taskQueue: d.taskQueue ?? null,
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

      setError(errs.length ? errs.join(' · ') : null);

      if (descResult.status === 'fulfilled' && descResult.value.status !== 'RUNNING') {
        try {
          const rr = await getResult(workflowId);
          setWorkflowResultPayload(rr.result ?? null);
        } catch {
          setWorkflowResultPayload(null);
        }
      } else {
        setWorkflowResultPayload(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }

    void (async () => {
      try {
        const streamResult = await Promise.allSettled([getStreamState(workflowId)]);
        const s = streamResult[0];
        if (s.status === 'fulfilled') {
          setStreamState(s.value);
          setStreamAvailable(true);
        } else {
          setStreamState(null);
          setStreamAvailable(false);
        }
      } catch {
        setStreamState(null);
        setStreamAvailable(false);
      }
    })();
  }, [workflowId]);

  /** Poll describe + history + stream while Temporal says RUNNING (or Durion stream still active). */
  const pollActiveRun = useCallback(async () => {
    if (!workflowId) return;
    try {
      const [dRes, hRes, sRes] = await Promise.allSettled([
        describeRun(workflowId),
        getHistory(workflowId),
        getStreamState(workflowId),
      ]);
      if (dRes.status === 'fulfilled') {
        const d = dRes.value;
        setDescribe({
          status: d.status,
          runId: d.runId ?? null,
          type: d.type,
          taskQueue: d.taskQueue ?? null,
          startTime: d.startTime,
          closeTime: d.closeTime,
          memo: d.memo ?? {},
        });
      }
      if (hRes.status === 'fulfilled') {
        setHistory(parseFullHistory(hRes.value));
      }
      if (sRes.status === 'fulfilled') {
        setStreamState(sRes.value);
        setStreamAvailable(true);
      }
      if (dRes.status === 'fulfilled' && dRes.value.status !== 'RUNNING') {
        try {
          const rr = await getResult(workflowId);
          setWorkflowResultPayload(rr.result ?? null);
        } catch {
          /* keep previous payload */
        }
      }
      /* On poll failure, keep last stream snapshot — avoids flicker when the worker is busy. */
    } catch {
      /* ignore transient poll errors */
    }
  }, [workflowId]);

  useEffect(() => {
    void fullRefresh();
  }, [fullRefresh]);

  const executionActive =
    describe?.status === 'RUNNING' ||
    streamState?.status === 'running' ||
    streamState?.status === 'waiting_for_input';

  useEffect(() => {
    if (!workflowId || !executionActive) return;
    const t = window.setInterval(() => void pollActiveRun(), 1500);
    return () => window.clearInterval(t);
  }, [workflowId, executionActive, pollActiveRun]);

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

  const effectiveWorkflowResult = workflowResultPayload ?? history.result;
  const hasResult = effectiveWorkflowResult != null;

  const graphSummary = useMemo(
    () => parseGraphResultSummary(effectiveWorkflowResult, history.executedNodes),
    [effectiveWorkflowResult, history.executedNodes],
  );

  const graphExecutionSteps = useMemo((): string[] => {
    if (streamState && 'completedNodes' in streamState) {
      const cn = (streamState as GraphStreamState).completedNodes;
      if (Array.isArray(cn) && cn.length > 0) return cn;
    }
    return history.executedNodes ?? [];
  }, [streamState, history.executedNodes]);

  const hasGraphTopology =
    history.topology != null || !!(streamState as GraphStreamState | null)?.topology;

  const showGraphSummaryRow =
    mode === 'graph' &&
    hasGraphTopology &&
    (isGraphResultPayload(effectiveWorkflowResult) ||
      graphExecutionSteps.length > 0 ||
      graphSummary.graphStatus != null ||
      graphSummary.totalTokens != null ||
      graphSummary.errorLine != null);

  const taskQueueLabel = describe?.taskQueue ?? history.taskQueue ?? null;

  const runDurationLabel = formatRunDuration(describe?.startTime ?? null, describe?.closeTime ?? null);

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

        {/* ── Run summary (Temporal-style dense header + graph extras) ─ */}
        <Card className="border-border py-0">
          <CardContent className="space-y-2 p-3 font-mono text-[10px] leading-tight">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {describe ? (
                <Badge variant="outline" className="rounded-sm font-mono text-[10px]">
                  {describe.status}
                </Badge>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
              <span className="text-foreground">{typeLabel}</span>
              {isLive && <span className="text-primary">live</span>}
              <span className="text-muted-foreground">
                · {mode ?? '—'}
                {history.events.length > 0 && (
                  <span className="text-muted-foreground/80"> · {history.events.length} history events</span>
                )}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-x-6 gap-y-2 border-t border-border pt-2 sm:grid-cols-3">
              <div className="space-y-1">
                <div>
                  <span className="text-muted-foreground">Start </span>
                  <span className="text-foreground">{formatRunDateTime(describe?.startTime)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">End </span>
                  <span className="text-foreground">{formatRunDateTime(describe?.closeTime)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Duration </span>
                  <span className="text-foreground">{runDurationLabel}</span>
                </div>
              </div>
              <div className="min-w-0 space-y-1">
                <div className="truncate" title={workflowId}>
                  <span className="text-muted-foreground">Workflow ID </span>
                  <span className="text-foreground">{workflowId || '—'}</span>
                </div>
                <div className="truncate" title={describe?.runId ?? undefined}>
                  <span className="text-muted-foreground">Run ID </span>
                  <span className="text-foreground">{describe?.runId ?? '—'}</span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="truncate" title={taskQueueLabel ?? undefined}>
                  <span className="text-muted-foreground">Task queue </span>
                  <span className="text-foreground">{taskQueueLabel ?? '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Updated </span>
                  <span className="text-muted-foreground">
                    {streamState?.updatedAt
                      ? new Date(streamState.updatedAt).toLocaleString()
                      : formatRunDateTime(describe?.closeTime ?? describe?.startTime)}
                  </span>
                </div>
              </div>
            </div>

            {showGraphSummaryRow && (
              <div className="space-y-1.5 border-t border-border pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-muted-foreground">Graph status </span>
                    {graphSummary.graphStatus ? (
                      <Badge variant="outline" className="ml-1 rounded-sm font-mono text-[9px]">
                        {graphSummary.graphStatus}
                      </Badge>
                    ) : (
                      <span className="text-foreground">—</span>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total tokens </span>
                    <span className="text-foreground">
                      {graphSummary.totalTokens != null ? graphSummary.totalTokens : '—'}
                    </span>
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-muted-foreground">Executed nodes</div>
                  <div
                    className="mt-0.5 max-w-full overflow-x-auto rounded border border-border bg-muted/20 px-1.5 py-1 text-[10px] text-foreground whitespace-nowrap"
                    title={graphExecutionSteps.join(' → ')}
                  >
                    {graphExecutionSteps.length > 0 ? graphExecutionSteps.join(' → ') : '—'}
                  </div>
                </div>
                {graphSummary.errorLine && (
                  <div>
                    <span className="text-muted-foreground">Graph error </span>
                    <span className="text-destructive">{graphSummary.errorLine}</span>
                  </div>
                )}
              </div>
            )}
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
          <TabButton active={activeTab === 'cost'} onClick={() => setActiveTab('cost')}>
            Cost Breakdown
          </TabButton>
        </div>

        {/* ── Content ───────────────────────────────────────────────── */}
        <div className="flex h-[560px] min-h-[420px] gap-4">
          <div className="flex-1 w-full relative">
            {refreshing && !describe && !hasEvents && (
              <p className="text-muted-foreground font-mono text-sm absolute top-0 left-0">Loading…</p>
            )}

            {activeTab === 'visualization' && (
              <div className="flex max-h-[560px] flex-col gap-3 overflow-y-auto pr-1">
                <GraphCanvas
                  state={streamState ?? undefined}
                  topology={describe?.memo?.['durion:topology'] as MemoTopology | undefined}
                  executedNodes={history?.executedNodes ?? undefined}
                  onNodeClick={(id) => openXRay(null, id)}
                />

                {mode === 'graph' &&
                  (history.activitySteps.length > 0 || history.activitySpans.length > 0) && (
                    <div className="space-y-2 border-t border-border pt-3">
                      <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                        Temporal activities
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        From event history (no worker required). Same runModel / runTool boundaries as Temporal Web UI.
                      </p>
                      {history.activitySpans.length > 0 && (
                        <EventHistoryGantt
                          spans={history.activitySpans}
                          historyStartMs={history.historyStartMs}
                          historyEndMs={history.historyEndMs}
                          isRunning={describe?.status === 'RUNNING'}
                        />
                      )}
                      {history.activitySteps.length > 0 && (
                        <ActivityList steps={history.activitySteps} onStepClick={openXRay} />
                      )}
                    </div>
                  )}

                {/* Agent: only with stream-state; degrade to activity list */}
                {mode === 'agent' && streamState && (
                  <AgentTimeline state={streamState} />
                )}
                {mode === 'agent' && !streamState && (
                  <div className="flex max-h-[560px] flex-col overflow-y-auto">
                    {history ? (
                      <ActivityList steps={history.activitySteps} onStepClick={openXRay} />
                    ) : (
                      <p className="text-muted-foreground p-4 font-mono text-sm">Waiting for execution history…</p>
                    )}
                  </div>
                )}

                {/* Workflow: always from history */}
                {mode === 'workflow' && <ActivityList steps={history.activitySteps} onStepClick={openXRay} />}

                {!mode && !refreshing && (
                  <p className="text-muted-foreground font-mono text-sm">
                    No visualization available for this run.
                  </p>
                )}
              </div>
            )}

            {activeTab === 'events' && (
              <div className="flex max-h-[560px] flex-col gap-4 overflow-y-auto pr-1">
                {history.activitySpans.length > 0 && (
                  <EventHistoryGantt
                    spans={history.activitySpans}
                    historyStartMs={history.historyStartMs}
                    historyEndMs={history.historyEndMs}
                    isRunning={describe?.status === 'RUNNING'}
                  />
                )}
                <div className="min-h-0 flex-1">
                  <p className="text-muted-foreground mb-2 font-mono text-[10px] uppercase tracking-wide">
                    Events
                  </p>
                  <EventTimeline
                    events={history.events}
                    scrollAreaClassName="h-72 sm:h-80"
                  />
                </div>
              </div>
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
                  {JSON.stringify(effectiveWorkflowResult, null, 2)}
                </pre>
              </ScrollArea>
            )}

            {activeTab === 'cost' && (
              <ScrollArea className="h-full rounded-md border border-border p-4">
                <CostBreakdown
                  history={history}
                  accumulatedCostUsd={describe?.memo?.accumulatedCost as number | undefined}
                />
              </ScrollArea>
            )}
          </div>

          {/* XRay Pane Side Drawer */}
          {isXRayOpen && (
            <div className="w-1/3 min-w-[320px] max-w-[500px] border border-border rounded-md overflow-hidden animate-in slide-in-from-right-8 duration-300 relative z-10 shadow-2xl">
              <XRayPane
                workflowId={workflowId}
                selectedStep={selectedStep}
                selectedNodeId={selectedNodeId}
                onClose={() => setIsXRayOpen(false)}
              />
            </div>
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
      className={`cursor-pointer border-b-2 px-3 py-2 transition-colors ${active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
        }`}
    >
      {children}
    </button>
  );
}
