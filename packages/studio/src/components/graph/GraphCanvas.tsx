import { useMemo, useCallback, useEffect } from 'react';
import Dagre from '@dagrejs/dagre';
import {
  ReactFlow,
  Background,
  Controls,
  type Edge,
  type Node,
  Position,
  useEdgesState,
  useNodesState,
  Handle,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GraphStreamState, GraphStreamStateEdge } from '@/lib/types';
import type { MemoTopology } from '@/lib/view-mode';
import { cn } from '@/lib/utils';

const nodeWidth = 168;
const nodeHeight = 40;

function GraphNode({ data }: NodeProps) {
  const status = data.status as 'idle' | 'active' | 'done' | 'error';
  const conditional = data.conditional as boolean | undefined;
  return (
    <div
      className={cn(
        'rounded border px-3 py-2 font-mono text-xs transition-colors duration-150',
        'border-border bg-card text-card-foreground min-w-[140px]',
        status === 'active' && 'border-primary ring-1 ring-primary/40',
        status === 'done' && 'border-primary/60 text-muted-foreground',
        status === 'error' && 'border-destructive text-destructive',
      )}
    >
      <Handle type="target" position={Position.Top} className="!size-2 !bg-muted-foreground" />
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'size-2 shrink-0 rounded-sm',
            status === 'idle' && 'bg-muted-foreground/40',
            status === 'active' && 'animate-pulse bg-primary',
            status === 'done' && 'bg-primary',
            status === 'error' && 'bg-destructive',
          )}
        />
        <span className="truncate">{String(data.label ?? '')}</span>
        {conditional && (
          <span className="text-muted-foreground text-[9px]" title="Has conditional routing">
            ⑂
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!size-2 !bg-muted-foreground" />
    </div>
  );
}

const nodeTypes = { graphNode: GraphNode };

function layoutElements(nodes: Node[], edges: Edge[]): Node[] {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 48, ranksep: 56, marginx: 20, marginy: 20 });
  nodes.forEach((n) => {
    g.setNode(n.id, { width: nodeWidth, height: nodeHeight });
  });
  edges.forEach((e) => {
    g.setEdge(e.source, e.target);
  });
  Dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    const x = (pos?.x ?? 0) - nodeWidth / 2;
    const y = (pos?.y ?? 0) - nodeHeight / 2;
    return {
      ...n,
      position: { x, y },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    };
  });
}

/**
 * Resolve conditional edges that have no static targets.
 * We infer targets from executedNodes: if a conditional edge's source was
 * executed, the node executed immediately after it is a likely target.
 */
function inferConditionalTargets(
  topoEdges: GraphStreamStateEdge[],
  executedNodes: string[],
): Map<string, string[]> {
  const inferred = new Map<string, string[]>();
  if (executedNodes.length === 0) return inferred;
  for (const e of topoEdges) {
    if (e.type !== 'conditional') continue;
    const targets = Array.isArray(e.to) ? e.to : [e.to];
    if (targets.length > 0 && targets[0]) continue;
    const srcIdx = executedNodes.indexOf(e.from);
    if (srcIdx === -1 || srcIdx >= executedNodes.length - 1) continue;
    const next = executedNodes[srcIdx + 1];
    inferred.set(e.from, [next]);
  }
  return inferred;
}

export interface GraphCanvasProps {
  /** Full stream state (Tier 2 — live from worker query). */
  state?: GraphStreamState;
  /** Static topology from memo (Tier 1 — no worker needed). */
  topology?: MemoTopology;
  /** Executed node names from workflow result (Tier 1 — completed runs). */
  executedNodes?: string[];
}

export function GraphCanvas({ state, topology: memoTopology, executedNodes: resultExecutedNodes }: GraphCanvasProps) {
  const topology = state?.topology ?? memoTopology ?? null;
  const activeNodes = state?.activeNodes ?? [];
  const completedNodes = state?.completedNodes ?? resultExecutedNodes ?? [];

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!topology) {
      return { initialNodes: [] as Node[], initialEdges: [] as Edge[] };
    }

    const active = new Set(activeNodes);
    const completed = new Set(completedNodes);
    const conditionalSources = new Set(
      topology.edges.filter((e) => e.type === 'conditional').map((e) => e.from),
    );

    const nodes: Node[] = topology.nodes.map((id) => {
      let status: 'idle' | 'active' | 'done' | 'error' = 'idle';
      if (active.has(id)) status = 'active';
      else if (completed.has(id)) status = 'done';
      return {
        id,
        type: 'graphNode',
        position: { x: 0, y: 0 },
        data: { label: id, status, conditional: conditionalSources.has(id) },
      };
    });

    const inferredTargets = inferConditionalTargets(topology.edges, completedNodes);

    const edges: Edge[] = [];
    for (const e of topology.edges) {
      const conditional = e.type === 'conditional';
      let targets = Array.isArray(e.to) ? e.to.filter(Boolean) : e.to ? [e.to] : [];

      if (conditional && targets.length === 0) {
        const inf = inferredTargets.get(e.from);
        if (inf) {
          for (const t of inf) {
            edges.push({
              id: `${e.from}->${t}:inferred`,
              source: e.from,
              target: t,
              animated: true,
              style: { strokeDasharray: '6 4' },
              className: 'stroke-primary/60',
              label: e.label ?? '',
            });
          }
        }
        continue;
      }

      for (const t of targets) {
        edges.push({
          id: `${e.from}->${t}`,
          source: e.from,
          target: t,
          style: conditional ? { strokeDasharray: '6 4' } : undefined,
          className: 'stroke-border',
          label: conditional && e.label ? e.label : undefined,
        });
      }
    }

    const laidOut = layoutElements(nodes, edges);
    return { initialNodes: laidOut, initialEdges: edges };
  }, [topology, activeNodes, completedNodes]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onInit = useCallback((instance: { fitView: (opts?: { padding?: number }) => void }) => {
    requestAnimationFrame(() => {
      instance.fitView({ padding: 0.2 });
    });
  }, []);

  if (!topology || topology.nodes.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center font-mono text-sm">
        No graph topology available.
      </div>
    );
  }

  return (
    <div className="h-[520px] w-full rounded-md border border-border">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onInit={onInit}
        proOptions={{ hideAttribution: true }}
        fitView
        className="bg-background"
      >
        <Background gap={20} size={1} className="opacity-30" />
        <Controls className="border border-border bg-card text-foreground" />
      </ReactFlow>
    </div>
  );
}
