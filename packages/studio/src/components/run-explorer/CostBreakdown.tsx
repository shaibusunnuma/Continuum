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

export function CostBreakdown({ history, accumulatedCostUsd }: CostBreakdownProps) {
  // Extract token counts and costs from activity events in history
  const { nodeStats, totals } = useMemo(() => {
    const stats = new Map<string, { calls: number; latencyMs: number; promptTokens: number; completionTokens: number; costUsd: number; modelIds: Set<string> }>();
    let totalPrompt = 0;
    let totalCompletion = 0;
    let totalComputedCost = 0;

    for (const step of history.activitySteps) {
      if (step.activityName !== 'runModel' && step.activityName !== 'runTool') continue;
      
      const payload = step.result?.payload || step.result;
      if (!payload) continue;

      // Extract usage directly from the result payload matching RunModelResult
      const usage = payload.usage as { totalTokens?: number; promptTokens?: number; completionTokens?: number } | undefined;
      const stepCost = typeof payload.costUsd === 'number' ? payload.costUsd : 0;
      const latencyMs = typeof payload.latencyMs === 'number' ? payload.latencyMs : 0;
      const inputData = Array.isArray(step.input) ? step.input[0] : step.input;
      const modelId = inputData?.modelId as string | undefined;
      
      let nodeRef = step.activityName;
      
      // Attempt to correlate to graph node from input traceContext
      const tc = inputData?.traceContext as { agentName?: string; } | undefined;
      if (tc?.agentName) {
        nodeRef = tc.agentName;
      }

      const id = nodeRef;
      if (!stats.has(id)) {
        stats.set(id, { calls: 0, latencyMs: 0, promptTokens: 0, completionTokens: 0, costUsd: 0, modelIds: new Set() });
      }
      
      const st = stats.get(id)!;
      st.calls += 1;
      st.latencyMs += latencyMs;
      
      if (modelId) st.modelIds.add(modelId);

      if (usage || stepCost > 0) {
        st.promptTokens += (usage?.promptTokens || 0);
        st.completionTokens += (usage?.completionTokens || 0);
        st.costUsd += stepCost;
        
        totalPrompt += (usage?.promptTokens || 0);
        totalCompletion += (usage?.completionTokens || 0);
        totalComputedCost += stepCost;
      }
    }

    return { 
      nodeStats: Array.from(stats.entries()).sort((a,b) => b[1].costUsd - a[1].costUsd || b[1].calls - a[1].calls), 
      totals: { prompt: totalPrompt, completion: totalCompletion, costUsd: totalComputedCost } 
    };
  }, [history]);

  const displayCost = accumulatedCostUsd !== undefined && accumulatedCostUsd > 0 ? accumulatedCostUsd : totals.costUsd;
  const hasUsage = totals.prompt > 0 || totals.completion > 0;

  if (!hasUsage && displayCost === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-muted-foreground border border-dashed rounded-lg bg-black/40 backdrop-blur-md">
        <Activity className="h-8 w-8 mb-4 opacity-50" />
        <h3 className="text-lg font-medium text-primary/80 tracking-tight">No Usage Data</h3>
        <p className="text-sm opacity-70">Model usage or token metrics were not found in this workflow's event history.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {/* KPI Cards */}
      <Card className="bg-black/60 border-zinc-800/50 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-linear-to-br from-green-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <CardHeader className="pb-2">
          <CardDescription className="uppercase tracking-widest text-[10px] font-bold text-green-400">Total Run Cost</CardDescription>
          <CardTitle className="text-4xl font-light tracking-tighter text-zinc-100">
            ${displayCost.toFixed(5)}
          </CardTitle>
        </CardHeader>
      </Card>

      <Card className="bg-black/60 border-zinc-800/50 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-linear-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <CardHeader className="pb-2">
          <CardDescription className="uppercase tracking-widest text-[10px] font-bold text-blue-400">Total Tokens</CardDescription>
          <CardTitle className="text-4xl font-light tracking-tighter text-zinc-100">
            {(totals.prompt + totals.completion).toLocaleString()}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-zinc-500 space-y-1">
          <div className="flex justify-between"><span>Prompt</span><span className="text-zinc-300 font-mono">{totals.prompt.toLocaleString()}</span></div>
          <div className="flex justify-between"><span>Completion</span><span className="text-zinc-300 font-mono">{totals.completion.toLocaleString()}</span></div>
        </CardContent>
      </Card>

      {/* Node Breakdown Table */}
      <Card className="md:col-span-2 lg:col-span-3 bg-black/40 border-zinc-800/50 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-sm font-medium tracking-wide text-zinc-300 uppercase">Per-Node Attribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-2">
              {nodeStats.map(([nodeId, stats]) => (
                <div key={nodeId} className="flex items-center justify-between p-3 rounded-md bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono text-xs border-zinc-700 bg-black/50 text-emerald-400">
                      {nodeId}
                    </Badge>
                    <div className="flex gap-2">
                      {Array.from(stats.modelIds).map(m => (
                        <Badge key={m} variant="secondary" className="text-[10px] bg-zinc-800 text-zinc-400">{m}</Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex text-right gap-6">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Calls</span>
                      <span className="text-sm font-mono text-zinc-300">{stats.calls}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Tokens</span>
                      <span className="text-sm font-mono text-zinc-300">{(stats.promptTokens + stats.completionTokens).toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Cost</span>
                      <span className="text-sm font-mono text-emerald-400">${stats.costUsd.toFixed(5)}</span>
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
