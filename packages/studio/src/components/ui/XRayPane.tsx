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
import type { ActivityStep } from '@/lib/types';

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
  /** Prefer showing token/latency badges only for model calls. */
  showModelMetrics: boolean;
} {
  if (!selectedStep && selectedNodeId) {
    return {
      kind: 'graph',
      primaryBadge: 'Graph node',
      badgeClass: 'text-chart-1 border-chart-1/35 bg-chart-1/12',
      showModelMetrics: false,
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
      showModelMetrics: true,
    };
  }
  if (name === 'runTool') {
    const tn = p?.toolName;
    return {
      kind: 'tool',
      primaryBadge: typeof tn === 'string' && tn.trim() ? tn : 'Tool',
      badgeClass: 'text-warning border-warning/35 bg-warning/12',
      showModelMetrics: false,
    };
  }
  if (name === 'runLifecycleHooks') {
    return {
      kind: 'lifecycle',
      primaryBadge: 'Lifecycle',
      badgeClass: 'text-chart-3 border-chart-3/35 bg-chart-3/12',
      showModelMetrics: false,
    };
  }

  return {
    kind: 'activity',
    primaryBadge: name.trim() || 'Activity',
    badgeClass: 'text-muted-foreground border-border bg-muted',
    showModelMetrics: false,
  };
}

interface XRayPaneProps {
  workflowId: string;
  selectedStep: ActivityStep | null;
  selectedNodeId?: string; // from graph
  onClose?: () => void;
}

export function XRayPane({ workflowId, selectedStep, selectedNodeId, onClose }: XRayPaneProps) {
  const [spans, setSpans] = useState<OtlpSpan[]>([]);
  const [messagesExpanded, setMessagesExpanded] = useState(false);
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

    getSpans(workflowId)
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
  }, [workflowId, selectedStep, selectedNodeId]);

  if (!selectedStep && !selectedNodeId) return null;

  const payload = selectedStep
    ? Array.isArray(selectedStep.input)
      ? selectedStep.input[0]
      : selectedStep.input
    : undefined;
  const meta = getXRayHeaderMeta(selectedStep, selectedNodeId, payload);
  const resultPayload = selectedStep?.result?.payload || selectedStep?.result;

  const usage = resultPayload?.usage;
  const latency = resultPayload?.latencyMs;

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

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <div className="p-4 sm:p-6 border-b border-border bg-card">
        <div className="flex justify-between items-start mb-4">
          <div>
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
              {meta.showModelMetrics && latency !== undefined && (
                <Badge variant="outline" className="text-muted-foreground border-border bg-muted font-mono">
                  <Clock className="mr-1 inline w-3 h-3" /> {latency}ms
                </Badge>
              )}
              {meta.showModelMetrics && usage !== undefined && (
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
