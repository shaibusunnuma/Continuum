import { useEffect, useState } from 'react';
import { getSpans } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Clock, Cpu, Database, Network } from 'lucide-react';
import type { ActivityStep } from '@/lib/types';

interface XRayPaneProps {
  workflowId: string;
  selectedStep: ActivityStep | null;
  selectedNodeId?: string; // from graph
  onClose?: () => void;
}

export function XRayPane({ workflowId, selectedStep, selectedNodeId, onClose }: XRayPaneProps) {
  const [spans, setSpans] = useState<any[]>([]);
  const [messagesExpanded, setMessagesExpanded] = useState(false);
  const [resultExpanded, setResultExpanded] = useState(true);

  useEffect(() => {
    if (!selectedStep?.activityId) {
      setSpans([]);
      return;
    }

    getSpans(workflowId)
      .then(allSpans => {
        // Find spans corresponding to this activity/node
        // Temporal attributes usually contain `activityId` but we also check our custom attributes
        if (!allSpans) return setSpans([]);
        const relevantSpans = allSpans.filter(span => {
          const attrs = span.attributes || [];
          return attrs.some((a: any) =>
            (a.key === 'ai.agent_name' && a.value?.stringValue === selectedNodeId) ||
            (a.key === 'ai.model.id') // basic correlation heuristic
          );
        });
        setSpans(relevantSpans);
      })
      .catch((err) => {
        console.error('Failed to fetch spans', err);
      });
  }, [workflowId, selectedStep, selectedNodeId]);

  if (!selectedStep && !selectedNodeId) return null;

  const payload = Array.isArray(selectedStep?.input) ? selectedStep?.input[0] : selectedStep?.input;
  const resultPayload = selectedStep?.result?.payload || selectedStep?.result;

  const usage = resultPayload?.usage;
  const latency = resultPayload?.latencyMs;
  const modelId = payload?.modelId || 'Unknown Model';

  return (
    <div className="flex flex-col h-full bg-black text-zinc-300">
      <div className="p-4 sm:p-6 border-b border-zinc-900 bg-zinc-950">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-light tracking-tight text-white flex items-center gap-3">
              <Cpu className="h-5 w-5 text-indigo-400" />
              {selectedNodeId || selectedStep?.activityName || 'Execution Step'}
            </h2>
            <div className="flex mt-2 gap-2 text-xs">
              <Badge variant="outline" className="text-indigo-400 border-indigo-900 bg-indigo-950">
                {modelId}
              </Badge>
              {latency !== undefined && (
                <Badge variant="outline" className="text-zinc-400 border-zinc-800 bg-zinc-900 font-mono">
                  <Clock className="w-3 h-3 mr-1 inline" /> {latency}ms
                </Badge>
              )}
              {usage !== undefined && (
                <Badge variant="outline" className="text-emerald-400 border-emerald-900 bg-emerald-950 font-mono">
                  {usage.totalTokens} Tokens
                </Badge>
              )}
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
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
                <h3 className="text-xs uppercase tracking-[0.2em] font-semibold text-zinc-500 flex items-center gap-2 group-hover:text-zinc-300 transition-colors">
                  <Database className="w-4 h-4" /> Message History ({payload.messages.length})
                </h3>
                {messagesExpanded ? <ChevronDown className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" /> : <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />}
              </button>

              {messagesExpanded && (
                <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-lg overflow-hidden backdrop-blur-md animate-in slide-in-from-top-2 duration-200">
                  {payload.messages.map((m: any, idx: number) => (
                    <div key={idx} className="border-b border-zinc-800/40 last:border-0 p-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className={`text-[10px] uppercase tracking-widest font-bold ${m.role === 'user' ? 'text-blue-400' :
                          m.role === 'assistant' ? 'text-emerald-400' :
                            m.role === 'system' ? 'text-purple-400' : 'text-amber-400'
                          }`}>
                          {m.role}
                        </span>
                      </div>
                      <pre className="text-xs leading-relaxed font-mono whitespace-pre-wrap text-zinc-300 wrap-break-word">
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
                <h3 className="text-xs uppercase tracking-[0.2em] font-semibold text-zinc-500 flex items-center gap-2 group-hover:text-zinc-300 transition-colors">
                  <Network className="w-4 h-4" /> Result Payload
                </h3>
                {resultExpanded ? <ChevronDown className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" /> : <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />}
              </button>

              {resultExpanded && (
                <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-lg p-4 animate-in slide-in-from-top-2 duration-200">
                  <pre className="text-xs font-mono text-emerald-300/80 overflow-auto whitespace-pre-wrap max-h-96">
                    {JSON.stringify(resultPayload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Span Data if any */}
          {spans.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs uppercase tracking-[0.2em] font-semibold text-zinc-500 mb-4 flex items-center gap-2">
                OTLP Trace Spans ({spans.length})
              </h3>
              {spans.map((s, i) => (
                <div key={i} className="bg-black border border-zinc-900 p-4 rounded-md">
                  <h4 className="font-mono text-zinc-400 text-xs mb-2">{s.name}</h4>
                  <pre className="text-[10px] font-mono text-zinc-600 overflow-auto whitespace-pre-wrap">
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
