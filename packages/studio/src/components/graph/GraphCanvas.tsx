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
import type { GraphStreamState } from '@/lib/types';
import { cn } from '@/lib/utils';

const nodeWidth = 168;
const nodeHeight = 40;

function GraphNode({ data }: NodeProps) {
  const status = data.status as 'idle' | 'active' | 'done' | 'error';
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

export function GraphCanvas({ state }: { state: GraphStreamState }) {
  const topology = state.topology;

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!topology) {
      return { initialNodes: [] as Node[], initialEdges: [] as Edge[] };
    }

    const active = new Set(state.activeNodes ?? []);
    const completed = new Set(state.completedNodes ?? []);

    const nodes: Node[] = topology.nodes.map((id) => {
      let status: 'idle' | 'active' | 'done' | 'error' = 'idle';
      if (active.has(id)) status = 'active';
      else if (completed.has(id)) status = 'done';
      return {
        id,
        type: 'graphNode',
        position: { x: 0, y: 0 },
        data: { label: id, status },
      };
    });

    const edges: Edge[] = [];
    for (const e of topology.edges) {
      const conditional = e.type === 'conditional';
      const targets = Array.isArray(e.to) ? e.to : [e.to];
      if (targets.length === 0) continue;
      for (const t of targets) {
        if (!t) continue;
        edges.push({
          id: `${e.from}->${t}`,
          source: e.from,
          target: t,
          style: conditional ? { strokeDasharray: '6 4' } : undefined,
          className: 'stroke-border',
        });
      }
    }

    const laidOut = layoutElements(nodes, edges);
    return { initialNodes: laidOut, initialEdges: edges };
  }, [topology, state.activeNodes, state.completedNodes]);

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
        No graph topology in stream state.
      </div>
    );
  }

  return (
    <div className="h-full min-h-[420px] w-full rounded-md border border-border">
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
