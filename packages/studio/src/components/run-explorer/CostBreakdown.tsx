import { useMemo } from 'react';
import type { ParsedHistory } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Activity } from 'lucide-react';

interface CostBreakdownProps {
  history: ParsedHistory;
  accumulatedCostUsd?: number; // from describe memo if present
}

function CumulativeCostSparkline({ steps }: { steps: { cumulative: number }[] }) {
  if (steps.length === 0) return null;
  const max = Math.max(...steps.map((s) => s.cumulative), 1e-9);
  const w = 400;
  const h = 48;
  const pad = 4;
  const innerW = w - 2 * pad;
  const innerH = h - 2 * pad;
  const pts = steps.map((s, i) => {
    const x = pad + (steps.length <= 1 ? innerW / 2 : (i / (steps.length - 1)) * innerW);
    const y = pad + innerH - (s.cumulative / max) * innerH;
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full text-primary/70" preserveAspectRatio="none">
      <polyline fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" points={pts.join(' ')} />
    </svg>
  );
}

export function CostBreakdown({ history, accumulatedCostUsd }: CostBreakdownProps) {
  const { nodeStats, totals, modelDistribution, cumulativeCostSteps } = useMemo(() => {
    const stats = new Map<
      string,
      {
        calls: number;
        latencyMs: number;
        promptTokens: number;
        completionTokens: number;
        costUsd: number;
        modelIds: Set<string>;
      }
    >();
    let totalPrompt = 0;
    let totalCompletion = 0;
    let totalComputedCost = 0;

    const byModel = new Map<string, { tokens: number; costUsd: number }>();
    const cumulativeCostSteps: { label: string; deltaCost: number; cumulative: number }[] = [];
    let cumulative = 0;

    for (const step of history.activitySteps) {
      if (step.activityName !== 'runModel' && step.activityName !== 'runTool') continue;

      const payload = step.result?.payload || step.result;
      if (!payload) continue;

      const usage = payload.usage as
        | { totalTokens?: number; promptTokens?: number; completionTokens?: number }
        | undefined;
      const stepCost = typeof payload.costUsd === 'number' ? payload.costUsd : 0;
      const latencyMs = typeof payload.latencyMs === 'number' ? payload.latencyMs : 0;
      const inputData = Array.isArray(step.input) ? step.input[0] : step.input;
      const modelId = inputData?.modelId as string | undefined;

      let nodeRef = step.activityName;
      const tc = inputData?.traceContext as { agentName?: string } | undefined;
      if (tc?.agentName) {
        nodeRef = tc.agentName;
      }

      const id = nodeRef;
      if (!stats.has(id)) {
        stats.set(id, {
          calls: 0,
          latencyMs: 0,
          promptTokens: 0,
          completionTokens: 0,
          costUsd: 0,
          modelIds: new Set(),
        });
      }

      const st = stats.get(id)!;
      st.calls += 1;
      st.latencyMs += latencyMs;

      if (modelId) st.modelIds.add(modelId);

      if (usage || stepCost > 0) {
        st.promptTokens += usage?.promptTokens || 0;
        st.completionTokens += usage?.completionTokens || 0;
        st.costUsd += stepCost;

        totalPrompt += usage?.promptTokens || 0;
        totalCompletion += usage?.completionTokens || 0;
        totalComputedCost += stepCost;

        const tokens = (usage?.promptTokens || 0) + (usage?.completionTokens || 0);
        if (modelId && (tokens > 0 || stepCost > 0)) {
          const m = byModel.get(modelId) ?? { tokens: 0, costUsd: 0 };
          m.tokens += tokens;
          m.costUsd += stepCost;
          byModel.set(modelId, m);
        }

        if (stepCost > 0) {
          cumulative += stepCost;
          cumulativeCostSteps.push({
            label: `${nodeRef} · ${step.activityName} (#${step.eventId})`,
            deltaCost: stepCost,
            cumulative,
          });
        }
      }
    }

    const modelTotalTokens = [...byModel.values()].reduce((s, m) => s + m.tokens, 0);
    const modelDistribution = [...byModel.entries()]
      .map(([modelId, v]) => ({
        modelId,
        tokens: v.tokens,
        costUsd: v.costUsd,
        pct: modelTotalTokens > 0 ? (v.tokens / modelTotalTokens) * 100 : 0,
      }))
      .sort((a, b) => b.tokens - a.tokens);

    return {
      nodeStats: Array.from(stats.entries()).sort(
        (a, b) => b[1].costUsd - a[1].costUsd || b[1].calls - a[1].calls,
      ),
      totals: { prompt: totalPrompt, completion: totalCompletion, costUsd: totalComputedCost },
      modelDistribution,
      cumulativeCostSteps,
    };
  }, [history]);

  const displayCost = accumulatedCostUsd !== undefined && accumulatedCostUsd > 0 ? accumulatedCostUsd : totals.costUsd;
  const hasUsage = totals.prompt > 0 || totals.completion > 0;

  if (!hasUsage && displayCost === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-muted-foreground border border-dashed rounded-lg bg-muted/40 backdrop-blur-md">
        <Activity className="h-8 w-8 mb-4 opacity-50" />
        <h3 className="text-lg font-medium text-primary/80 tracking-tight">No Usage Data</h3>
        <p className="text-sm opacity-70">Model usage or token metrics were not found in this workflow's event history.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {/* KPI Cards */}
      <Card className="bg-card/90 border-border/80 backdrop-blur-xl shadow-2xl relative overflow-hidden group gap-2 py-3">
        <div className="absolute inset-0 bg-linear-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <CardHeader className="gap-1 px-4 py-0">
          <CardDescription className="uppercase tracking-widest text-[10px] font-bold text-primary">
            Total Run Cost
          </CardDescription>
          <CardTitle className="text-3xl font-light tracking-tighter text-foreground">
            ${displayCost.toFixed(5)}
          </CardTitle>
        </CardHeader>
      </Card>

      <Card className="bg-card/90 border-border/80 backdrop-blur-xl shadow-2xl relative overflow-hidden group gap-2 py-3">
        <div className="absolute inset-0 bg-linear-to-br from-chart-2/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <CardHeader className="gap-1 px-4 py-0">
          <CardDescription className="uppercase tracking-widest text-[10px] font-bold text-chart-2">
            Total Tokens
          </CardDescription>
          <CardTitle className="text-3xl font-light tracking-tighter text-foreground">
            {(totals.prompt + totals.completion).toLocaleString()}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0.5 px-4 pb-0 pt-1 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Prompt</span>
            <span className="font-mono text-foreground/90">{totals.prompt.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>Completion</span>
            <span className="font-mono text-foreground/90">{totals.completion.toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>

      {modelDistribution.length > 0 && (
        <Card className="md:col-span-2 lg:col-span-3 gap-2 bg-card/60 border-border/80 py-3 backdrop-blur-xl">
          <CardHeader className="px-4 py-0 pb-1">
            <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Model usage (tokens)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-3 pt-0">
            {modelDistribution.map((row) => (
              <div key={row.modelId} className="space-y-1">
                <div className="flex justify-between gap-2 font-mono text-[11px] text-muted-foreground">
                  <span className="min-w-0 truncate text-foreground/90">{row.modelId}</span>
                  <span className="shrink-0 tabular-nums">
                    {row.tokens.toLocaleString()} tok · ${row.costUsd.toFixed(5)}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-chart-1/80"
                    style={{ width: `${Math.max(row.pct, 0.5)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {cumulativeCostSteps.length > 0 && (
        <Card className="md:col-span-2 lg:col-span-3 gap-2 bg-card/60 border-border/80 py-3 backdrop-blur-xl">
          <CardHeader className="px-4 py-0 pb-1">
            <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Cumulative cost by step order
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className="mb-3 h-16 w-full font-mono text-[10px] text-muted-foreground">
              <CumulativeCostSparkline steps={cumulativeCostSteps} />
            </div>
            <ScrollArea className="max-h-40 pr-3">
              <div className="space-y-1 font-mono text-[11px]">
                {cumulativeCostSteps.map((row, i) => (
                  <div
                    key={`${row.label}-${i}`}
                    className="flex justify-between gap-2 border-b border-border/60 py-1 last:border-0"
                  >
                    <span className="min-w-0 flex-1 truncate text-muted-foreground" title={row.label}>
                      {row.label}
                    </span>
                    <span className="shrink-0 tabular-nums text-primary/90">
                      +${row.deltaCost.toFixed(5)} → ${row.cumulative.toFixed(5)}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Node Breakdown Table */}
      <Card className="md:col-span-2 lg:col-span-3 gap-2 bg-card/60 border-border/80 py-3 backdrop-blur-xl">
        <CardHeader className="px-4 py-0 pb-1">
          <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Per-Node Attribution
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 pt-0">
          <ScrollArea className="h-[min(280px,45vh)] pr-3">
            <div className="space-y-1.5">
              {nodeStats.map(([nodeId, stats]) => (
                <div
                  key={nodeId}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 p-2 transition-colors hover:border-muted-foreground/40"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono text-xs border-border bg-card/80 text-primary">
                      {nodeId}
                    </Badge>
                    <div className="flex gap-2">
                      {Array.from(stats.modelIds).map(m => (
                        <Badge key={m} variant="secondary" className="text-[10px] bg-secondary text-muted-foreground">{m}</Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex text-right gap-6">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Calls</span>
                      <span className="text-sm font-mono text-foreground/90">{stats.calls}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Tokens</span>
                      <span className="text-sm font-mono text-foreground/90">{(stats.promptTokens + stats.completionTokens).toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost</span>
                      <span className="text-sm font-mono text-primary">${stats.costUsd.toFixed(5)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
