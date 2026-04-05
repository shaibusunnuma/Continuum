import { useEffect, useState } from 'react';
import { getSpans } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  Database,
  GitBranch,
  Layers,
  Network,
  Wrench,
  Workflow,
} from 'lucide-react';
import type { ActivityStep, GraphStreamState } from '@/lib/types';

type XRayKind = 'model' | 'tool' | 'lifecycle' | 'graph' | 'activity';

type OtlpSpan = {
  name?: string;
  attributes?: Array<{ key: string; value?: { stringValue?: string } }>;
};

function spanAttrString(span: OtlpSpan, key: string): string | undefined {
  const a = span.attributes?.find((x) => x.key === key);
  const s = a?.value?.stringValue;
  return typeof s === 'string' ? s : undefined;
}

/** Header badge + styling from Temporal activity name (or graph-only selection). */
export function getXRayHeaderMeta(
  selectedStep: ActivityStep | null,
  selectedNodeId: string | undefined,
  payload: unknown,
): {
  kind: XRayKind;
  primaryBadge: string;
  badgeClass: string;
  /** Token usage badges — only model activities carry `usage`. */
  showTokenMetrics: boolean;
} {
  if (!selectedStep && selectedNodeId) {
    return {
      kind: 'graph',
      primaryBadge: 'Graph node',
      badgeClass: 'text-chart-1 border-chart-1/35 bg-chart-1/12',
      showTokenMetrics: false,
    };
  }

  const name = selectedStep?.activityName ?? '';
  const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;

  if (name === 'runModel') {
    const mid = p?.modelId;
    return {
      kind: 'model',
      primaryBadge: typeof mid === 'string' && mid.trim() ? mid : 'Model',
      badgeClass: 'text-chart-2 border-chart-2/35 bg-chart-2/12',
      showTokenMetrics: true,
    };
  }
  if (name === 'runTool') {
    const tn = p?.toolName;
    return {
      kind: 'tool',
      primaryBadge: typeof tn === 'string' && tn.trim() ? tn : 'Tool',
      badgeClass: 'text-warning border-warning/35 bg-warning/12',
      showTokenMetrics: false,
    };
  }
  if (name === 'runLifecycleHooks') {
    return {
      kind: 'lifecycle',
      primaryBadge: 'Lifecycle',
      badgeClass: 'text-chart-3 border-chart-3/35 bg-chart-3/12',
      showTokenMetrics: false,
    };
  }

  return {
    kind: 'activity',
    primaryBadge: name.trim() || 'Activity',
    badgeClass: 'text-muted-foreground border-border bg-muted',
    showTokenMetrics: false,
  };
}

interface XRayPaneProps {
  workflowId: string;
  /** Temporal run id when pinned; scopes OTLP span fetch to one execution. */
  temporalRunId?: string | null;
  /** When X-Ray shows a child activity, parent ids for context (optional). */
  parentWorkflowId?: string;
  parentRunId?: string | null;
  selectedStep: ActivityStep | null;
  selectedNodeId?: string; // from graph
  /** Live graph stream (node status / topology) when available. */
  graphStreamState?: GraphStreamState | null;
  /** Completed node order from history or stream (graph runs). */
  executedNodes?: string[];
  onClose?: () => void;
}

export function XRayPane({
  workflowId,
  temporalRunId,
  parentWorkflowId,
  parentRunId,
  selectedStep,
  selectedNodeId,
  graphStreamState,
  executedNodes,
  onClose,
}: XRayPaneProps) {
  const [spans, setSpans] = useState<OtlpSpan[]>([]);
  const [messagesExpanded, setMessagesExpanded] = useState(false);
  const [inputExpanded, setInputExpanded] = useState(true);
  const [resultExpanded, setResultExpanded] = useState(true);

  useEffect(() => {
    const activityId = selectedStep?.activityId;
    const input0 =
      selectedStep?.input != null
        ? Array.isArray(selectedStep.input)
          ? selectedStep.input[0]
          : selectedStep.input
        : undefined;
    const agentFromInput =
      input0 && typeof input0 === 'object' && input0 !== null && 'traceContext' in input0
        ? (input0 as { traceContext?: { agentName?: string } }).traceContext?.agentName
        : undefined;
    const agentName =
      typeof selectedNodeId === 'string' && selectedNodeId.trim()
        ? selectedNodeId
        : typeof agentFromInput === 'string'
          ? agentFromInput
          : undefined;

    if (!activityId && !agentName) {
      setSpans([]);
      return;
    }

    getSpans(
      workflowId,
      temporalRunId != null && String(temporalRunId).trim()
        ? { runId: String(temporalRunId).trim() }
        : undefined,
    )
      .then((allSpans) => {
        if (!Array.isArray(allSpans) || allSpans.length === 0) {
          setSpans([]);
          return;
        }
        const list = allSpans as OtlpSpan[];
        if (activityId) {
          setSpans(list.filter((s) => spanAttrString(s, 'durion.activityId') === activityId));
          return;
        }
        setSpans(list.filter((s) => spanAttrString(s, 'durion.agentName') === agentName));
      })
      .catch((err) => {
        console.error('Failed to fetch spans', err);
        setSpans([]);
      });
  }, [workflowId, temporalRunId, selectedStep, selectedNodeId]);

  if (!selectedStep && !selectedNodeId) return null;

  const payload = selectedStep
    ? Array.isArray(selectedStep.input)
      ? selectedStep.input[0]
      : selectedStep.input
    : undefined;
  const meta = getXRayHeaderMeta(selectedStep, selectedNodeId, payload);
  const resultPayload = selectedStep?.result?.payload || selectedStep?.result;

  const toolArgs =
    meta.kind === 'tool' &&
    payload &&
    typeof payload === 'object' &&
    payload !== null &&
    'input' in payload
      ? (payload as { input?: unknown }).input
      : undefined;

  const usage = resultPayload?.usage;
  const latencyMs = resultPayload?.latencyMs;
  const showLatencyBadge =
    selectedStep != null && typeof latencyMs === 'number' && Number.isFinite(latencyMs);

  const HeaderIcon =
    meta.kind === 'model'
      ? Cpu
      : meta.kind === 'tool'
        ? Wrench
        : meta.kind === 'lifecycle'
          ? Workflow
          : meta.kind === 'graph'
            ? GitBranch
            : Layers;

  const iconClass =
    meta.kind === 'model'
      ? 'text-chart-2'
      : meta.kind === 'tool'
        ? 'text-warning'
        : meta.kind === 'lifecycle'
          ? 'text-chart-3'
          : meta.kind === 'graph'
            ? 'text-chart-1'
            : 'text-muted-foreground';

  const lifecycleType =
    meta.kind === 'lifecycle' &&
    payload &&
    typeof payload === 'object' &&
    'type' in payload &&
    typeof (payload as { type: unknown }).type === 'string'
      ? String((payload as { type: string }).type)
      : null;

  const isChildOtelContext =
    parentWorkflowId &&
    parentWorkflowId.trim() &&
    workflowId.trim() !== parentWorkflowId.trim();

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <div className="p-4 sm:p-6 border-b border-border bg-card">
        <div className="flex justify-between items-start mb-4">
          <div>
            {isChildOtelContext ? (
              <p className="text-muted-foreground mb-2 font-mono text-[10px] leading-relaxed">
                Traces scoped to child{' '}
                <span className="text-foreground/90">{workflowId}</span>
                {temporalRunId ? (
                  <>
                    {' '}
                    · run <span className="text-foreground/80">{String(temporalRunId)}</span>
                  </>
                ) : null}
                <br />
                Parent{' '}
                <span className="text-foreground/80">{parentWorkflowId}</span>
                {parentRunId ? (
                  <>
                    {' '}
                    · run <span className="text-foreground/70">{parentRunId}</span>
                  </>
                ) : null}
              </p>
            ) : null}
            <h2 className="text-xl font-light tracking-tight text-foreground flex items-center gap-3">
              <HeaderIcon className={`h-5 w-5 shrink-0 ${iconClass}`} />
              {selectedNodeId || selectedStep?.activityName || 'Execution Step'}
            </h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className={meta.badgeClass}>
                {meta.primaryBadge}
              </Badge>
              {lifecycleType ? (
                <Badge variant="outline" className="font-mono text-muted-foreground border-border bg-muted">
                  {lifecycleType}
                </Badge>
              ) : null}
              {showLatencyBadge && (
                <Badge variant="outline" className="text-muted-foreground border-border bg-muted font-mono">
                  <Clock className="mr-1 inline w-3 h-3" /> {latencyMs}ms
                </Badge>
              )}
              {meta.showTokenMetrics && usage !== undefined && (
                <Badge variant="outline" className="text-primary border-primary/35 bg-primary/12 font-mono">
                  {usage.totalTokens} Tokens
                </Badge>
              )}
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
        <div className="space-y-8 pb-10">

          {/* Activity / tool input (runTool tool args + full scheduled payload) */}
          {selectedStep && payload != null && typeof payload === 'object' && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setInputExpanded(!inputExpanded)}
                className="group flex w-full cursor-pointer items-center justify-between"
              >
                <h3 className="text-muted-foreground hover:text-foreground/80 flex items-center gap-2 text-xs font-semibold tracking-[0.2em] uppercase transition-colors">
                  <Layers className="h-4 w-4" /> Activity input
                </h3>
                {inputExpanded ? (
                  <ChevronDown className="text-muted-foreground/70 group-hover:text-muted-foreground h-4 w-4 transition-colors" />
                ) : (
                  <ChevronRight className="text-muted-foreground/70 group-hover:text-muted-foreground h-4 w-4 transition-colors" />
                )}
              </button>
              {inputExpanded && (
                <div className="animate-in slide-in-from-top-2 space-y-3 duration-200">
                  {meta.kind === 'tool' && toolArgs !== undefined && (
                    <div>
                      <p className="text-muted-foreground mb-1 font-mono text-[10px] uppercase tracking-wide">
                        Tool arguments
                      </p>
                      <div className="bg-warning/8 border-warning/25 rounded-lg border p-3">
                        <pre className="text-warning/95 max-h-48 overflow-auto font-mono text-xs whitespace-pre-wrap">
                          {JSON.stringify(toolArgs, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground mb-1 font-mono text-[10px] uppercase tracking-wide">
                      Full scheduled payload
                    </p>
                    <div className="bg-card/50 border-border/80 rounded-lg border p-3 backdrop-blur-md">
                      <pre className="text-foreground/90 max-h-64 overflow-auto font-mono text-xs whitespace-pre-wrap">
                        {JSON.stringify(payload, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Graph node context (no matching activity — e.g. node only runs children) */}
          {meta.kind === 'graph' && selectedNodeId && (
            <div className="space-y-3">
              <h3 className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-[0.2em] uppercase">
                <GitBranch className="h-4 w-4" /> Graph node
              </h3>
              <p className="text-muted-foreground text-xs leading-relaxed">
                This node may only schedule child workflows (no <code className="text-foreground/80">runModel</code>{' '}
                / <code className="text-foreground/80">runTool</code> on the graph worker). Use the timeline bar to
                expand child runs inline, or check stream state below.
              </p>
              {graphStreamState?.topology && (
                <div className="bg-card/40 border-border rounded-md border p-3">
                  <p className="text-muted-foreground mb-2 font-mono text-[10px] uppercase">Live topology</p>
                  <pre className="text-muted-foreground max-h-40 overflow-auto font-mono text-[10px] whitespace-pre-wrap">
                    {JSON.stringify(graphStreamState.topology, null, 2)}
                  </pre>
                </div>
              )}
              {(graphStreamState?.activeNodes?.length || graphStreamState?.completedNodes?.length) ? (
                <div className="text-xs">
                  {graphStreamState?.activeNodes && graphStreamState.activeNodes.length > 0 ? (
                    <p className="text-chart-2 mb-1">
                      Active: {graphStreamState.activeNodes.join(', ')}
                    </p>
                  ) : null}
                  {graphStreamState?.completedNodes && graphStreamState.completedNodes.length > 0 ? (
                    <p className="text-muted-foreground">
                      Completed (stream): {graphStreamState.completedNodes.join(' → ')}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {executedNodes && executedNodes.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-1 font-mono text-[10px] uppercase">Executed (history)</p>
                  <p className="text-foreground/85 font-mono text-xs leading-relaxed break-words">
                    {executedNodes.map((id, i) => (
                      <span key={`${id}-${i}`}>
                        {i > 0 ? ' → ' : null}
                        <span className={id === selectedNodeId ? 'text-chart-1 font-semibold' : undefined}>
                          {id === selectedNodeId ? `【${id}】` : id}
                        </span>
                      </span>
                    ))}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Messages / Prompts Pane */}
          {payload?.messages && (
            <div className="space-y-3">
              <button
                onClick={() => setMessagesExpanded(!messagesExpanded)}
                className="w-full flex items-center justify-between group cursor-pointer"
              >
                <h3 className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground flex items-center gap-2 group-hover:text-foreground/80 transition-colors">
                  <Database className="w-4 h-4" /> Message History ({payload.messages.length})
                </h3>
                {messagesExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground/70 group-hover:text-muted-foreground transition-colors" /> : <ChevronRight className="w-4 h-4 text-muted-foreground/70 group-hover:text-muted-foreground transition-colors" />}
              </button>

              {messagesExpanded && (
                <div className="bg-card/50 border border-border/80 rounded-lg overflow-hidden backdrop-blur-md animate-in slide-in-from-top-2 duration-200">
                  {payload.messages.map((m: any, idx: number) => (
                    <div key={idx} className="border-b border-border/50 last:border-0 p-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className={`text-[10px] uppercase tracking-widest font-bold ${m.role === 'user' ? 'text-chart-1' :
                          m.role === 'assistant' ? 'text-primary' :
                            m.role === 'system' ? 'text-chart-4' : 'text-warning'
                          }`}>
                          {m.role}
                        </span>
                      </div>
                      <pre className="text-xs leading-relaxed font-mono whitespace-pre-wrap text-foreground/90 wrap-break-word">
                        {m.content?.trim() || (m.toolCalls ? JSON.stringify(m.toolCalls, null, 2) : '')}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Raw Output */}
          {resultPayload && (
            <div className="space-y-3">
              <button
                onClick={() => setResultExpanded(!resultExpanded)}
                className="w-full flex items-center justify-between group cursor-pointer"
              >
                <h3 className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground flex items-center gap-2 group-hover:text-foreground/80 transition-colors">
                  <Network className="w-4 h-4" /> Result Payload
                </h3>
                {resultExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground/70 group-hover:text-muted-foreground transition-colors" /> : <ChevronRight className="w-4 h-4 text-muted-foreground/70 group-hover:text-muted-foreground transition-colors" />}
              </button>

              {resultExpanded && (
                <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 animate-in slide-in-from-top-2 duration-200">
                  <pre className="text-xs font-mono text-primary/85 overflow-auto whitespace-pre-wrap max-h-96">
                    {JSON.stringify(resultPayload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Span Data if any */}
          {spans.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground mb-4 flex items-center gap-2">
                OTLP Trace Spans ({spans.length})
              </h3>
              {spans.map((s, i) => (
                <div key={i} className="bg-muted border border-border p-4 rounded-md">
                  <h4 className="font-mono text-muted-foreground text-xs mb-2">{s.name}</h4>
                  <pre className="text-[10px] font-mono text-muted-foreground/80 overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(s.attributes, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
