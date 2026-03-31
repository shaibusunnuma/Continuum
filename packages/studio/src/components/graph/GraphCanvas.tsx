import { useMemo, useCallback, useEffect, type CSSProperties, type ReactNode } from 'react';
import Dagre from '@dagrejs/dagre';
import {
  ReactFlow,
  Background,
  Controls,
  type Edge,
  type Node,
  MarkerType,
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
import { GitBranch } from 'lucide-react';

const nodeWidth = 168;
const nodeHeight = 40;

function GraphNode({ data }: NodeProps) {
  const status = data.status as 'idle' | 'active' | 'done' | 'error';
  const conditional = data.conditional as boolean | undefined;
  const handleClass =
    status === 'active'
      ? '!size-2.5 !border-2 !border-warning !bg-warning'
      : status === 'done'
        ? '!size-2 !border border-primary/80 !bg-primary'
        : status === 'error'
          ? '!size-2 !bg-destructive'
          : '!size-2 !bg-muted-foreground/35';

  return (
    <div
      className={cn(
        'rounded-md border-2 px-3 py-2 font-mono text-xs transition-colors duration-200',
        'min-w-[140px] shadow-sm',
        /* Not reached yet — quiet */
        status === 'idle' &&
          'border-muted-foreground/35 bg-card/70 text-muted-foreground',
        /* Finished successfully — green story */
        status === 'done' &&
          'border-primary/90 bg-primary/12 text-primary',
        /* Running now — warm, high contrast */
        status === 'active' &&
          'border-warning bg-warning/12 text-warning shadow-[0_0_20px_-4px_color-mix(in_oklch,var(--warning)_45%,transparent)] ring-2 ring-warning/35',
        status === 'error' && 'border-destructive bg-destructive/10 text-destructive',
      )}
    >
      <Handle type="target" position={Position.Top} className={handleClass} />
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'size-2.5 shrink-0 rounded-full',
            status === 'idle' && 'bg-muted-foreground/40 ring-1 ring-border/60',
            status === 'active' &&
              'animate-pulse bg-warning shadow-[0_0_8px_color-mix(in_oklch,var(--warning)_70%,transparent)]',
            status === 'done' && 'bg-primary ring-1 ring-primary/40',
            status === 'error' && 'bg-destructive',
          )}
        />
        <span className="min-w-0 flex-1 truncate font-medium">{String(data.label ?? '')}</span>
        {conditional && (
          <span
            className="inline-flex shrink-0 items-center gap-0.5 rounded border border-chart-4/50 bg-chart-4/15 px-1 py-0.5 text-[8px] font-semibold uppercase leading-none tracking-wide text-chart-4"
            title="Conditional routing: the next edge is chosen from workflow graph state at this step."
            aria-label="Conditional routing"
          >
            <GitBranch className="size-2.5 text-chart-4" strokeWidth={2.5} aria-hidden />
            if
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className={handleClass} />
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
 * Scans ALL occurrences in executedNodes to collect every unique target
 * (handles loops where a conditional source runs multiple iterations).
 */
/** Count consecutive (from → to) pairs in execution order (loops → N > 1). */
function directedTransitionCounts(order: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < order.length - 1; i++) {
    const from = order[i];
    const to = order[i + 1];
    const k = `${from}\0${to}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function edgeLabelWithTraversal(baseText: string | undefined, traversalCount: number): ReactNode | undefined {
  const base = baseText?.trim() || undefined;
  if (traversalCount <= 1 && !base) return undefined;
  const tip =
    traversalCount > 1
      ? `Followed ${traversalCount} times in this run (from execution order).`
      : undefined;
  if (traversalCount <= 1) return base;
  const mark = `×${traversalCount}`;
  if (!base) {
    return (
      <span title={tip} className="font-mono text-[10px] font-semibold">
        {mark}
      </span>
    );
  }
  return (
    <span title={tip} className="font-mono text-[10px]">
      <span>{base}</span>
      <span className="text-muted-foreground mx-0.5">·</span>
      <span className="font-semibold">{mark}</span>
    </span>
  );
}

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
    const unique = new Set<string>();
    for (let i = 0; i < executedNodes.length - 1; i++) {
      if (executedNodes[i] === e.from) unique.add(executedNodes[i + 1]);
    }
    if (unique.size > 0) inferred.set(e.from, [...unique]);
  }
  return inferred;
}

/** Edge narrative: what happened vs what is live vs what is still ahead. */
type EdgeStory =
  | 'inactive'
  | 'traversed'
  | 'into_active'
  | 'from_active'
  | 'possible_next'
  | 'conditional_taken'
  | 'conditional_possible';

function wasTraversedInOrder(from: string, to: string, order: string[]): boolean {
  for (let i = 0; i < order.length - 1; i++) {
    if (order[i] === from && order[i + 1] === to) return true;
  }
  return false;
}

/** Both ends finished and `to` runs after `from` in history (handles fan-in). */
function bothDoneAndTargetLater(from: string, to: string, order: string[]): boolean {
  const iFrom = order.lastIndexOf(from);
  const iTo = order.lastIndexOf(to);
  return iFrom >= 0 && iTo >= 0 && iTo > iFrom;
}

function classifyEdgeStory(
  from: string,
  to: string,
  active: Set<string>,
  completed: Set<string>,
  order: string[],
): EdgeStory {
  const srcAct = active.has(from);
  const tgtAct = active.has(to);
  const srcDone = completed.has(from);
  const tgtDone = completed.has(to);

  if (tgtAct && (srcDone || srcAct)) return 'into_active';
  if (srcAct && !tgtAct) return 'from_active';
  if (wasTraversedInOrder(from, to, order)) return 'traversed';
  if (srcDone && tgtDone && bothDoneAndTargetLater(from, to, order)) return 'traversed';
  if (srcDone && !tgtDone && !tgtAct) return 'possible_next';
  return 'inactive';
}

/**
 * Inline SVG stroke — React Flow’s `.react-flow__edge-path` uses CSS variables; without
 * an inline `stroke`, edges stay gray. Markers use the same hex so arrowheads match.
 */
function edgeVisuals(
  story: EdgeStory,
  edgeIsConditional: boolean,
): { style: CSSProperties; animated?: boolean; markerColor: string } {
  const dash: CSSProperties =
    edgeIsConditional && story !== 'conditional_taken'
      ? { strokeDasharray: '6 4' }
      : story === 'conditional_taken'
        ? { strokeDasharray: '6 4' }
        : {};

  switch (story) {
    case 'conditional_taken':
      return {
        style: { stroke: 'var(--chart-4)', strokeWidth: 2.2, ...dash },
        markerColor: 'var(--chart-4)',
      };
    case 'traversed':
      return {
        style: { stroke: 'var(--primary)', strokeWidth: 2.25, ...dash },
        markerColor: 'var(--primary)',
      };
    case 'into_active':
      return {
        style: { stroke: 'var(--warning)', strokeWidth: 2.75, ...dash },
        animated: true,
        markerColor: 'var(--warning)',
      };
    case 'from_active':
      return {
        style: { stroke: 'var(--warning-soft)', strokeWidth: 2.75, ...dash },
        animated: true,
        markerColor: 'var(--warning-soft)',
      };
    case 'possible_next':
      return {
        style: { stroke: 'var(--chart-1)', strokeWidth: 1.75, strokeDasharray: '4 4' },
        markerColor: 'var(--chart-1)',
      };
    case 'conditional_possible':
      return {
        style: { stroke: 'var(--muted-foreground)', strokeWidth: 1.25, strokeDasharray: '5 4' },
        markerColor: 'var(--muted-foreground)',
      };
    default:
      return {
        style: { stroke: 'var(--border)', strokeWidth: 1.15, ...dash },
        markerColor: 'var(--border)',
      };
  }
}

export interface GraphCanvasProps {
  /** Full stream state (Tier 2 — live from worker query). */
  state?: GraphStreamState;
  /** Static topology from memo (Tier 1 — no worker needed). */
  topology?: MemoTopology;
  /** Executed node names from workflow result (Tier 1 — completed runs). */
  executedNodes?: string[];
  /** Callback when a node is clicked */
  onNodeClick?: (nodeId: string) => void;
}

const EMPTY_ARRAY: string[] = [];

export function GraphCanvas({
  state,
  topology: memoTopology,
  executedNodes: resultExecutedNodes,
  onNodeClick,
}: GraphCanvasProps) {
  const topology = state?.topology ?? memoTopology ?? null;
  const activeNodes = state?.activeNodes ?? EMPTY_ARRAY;
  const completedNodes = state?.completedNodes ?? resultExecutedNodes ?? EMPTY_ARRAY;

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!topology) {
      return { initialNodes: [] as Node[], initialEdges: [] as Edge[] };
    }

    const active = new Set(activeNodes);
    const completed = new Set(completedNodes);
    /** Order of finished nodes — used to mark edges that were actually taken. */
    const executionOrder = completedNodes;
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

    // Nodes that are targets of at least one static edge
    const staticTargetNodes = new Set<string>();
    for (const e of topology.edges) {
      if (e.type === 'static') {
        const ts = Array.isArray(e.to) ? e.to : e.to ? [e.to] : [];
        for (const t of ts) staticTargetNodes.add(t);
      }
    }
    const entryNodeName = completedNodes[0] ?? activeNodes[0] ?? topology.nodes[0];
    // Nodes reachable ONLY via conditional routing (no static incoming, not entry)
    const conditionalOnlyTargets = new Set(
      topology.nodes.filter((n) => !staticTargetNodes.has(n) && n !== entryNodeName),
    );

    const edges: Edge[] = [];
    for (const e of topology.edges) {
      const conditional = e.type === 'conditional';
      let targets = Array.isArray(e.to) ? e.to.filter(Boolean) : e.to ? [e.to] : [];

      if (conditional && targets.length === 0) {
        const inf = new Set(inferredTargets.get(e.from) ?? []);

        // Taken branches (inferred from execution order)
        for (const t of inf) {
          const v = edgeVisuals('conditional_taken', true);
          edges.push({
            id: `${e.from}->${t}:inferred`,
            source: e.from,
            target: t,
            style: v.style,
            markerEnd: { type: MarkerType.ArrowClosed, color: v.markerColor },
            label: e.label?.trim() ? e.label : undefined,
          });
        }

        // Possible but untaken branches — orphan nodes that must come from this conditional
        for (const t of conditionalOnlyTargets) {
          if (inf.has(t)) continue;
          const v = edgeVisuals('conditional_possible', true);
          edges.push({
            id: `${e.from}->${t}:possible`,
            source: e.from,
            target: t,
            style: v.style,
            markerEnd: { type: MarkerType.ArrowClosed, color: v.markerColor },
          });
        }
        continue;
      }

      for (const t of targets) {
        const story = classifyEdgeStory(e.from, t, active, completed, executionOrder);
        const v = edgeVisuals(story, conditional);
        edges.push({
          id: `${e.from}->${t}`,
          source: e.from,
          target: t,
          animated: v.animated,
          style: v.style,
          markerEnd: { type: MarkerType.ArrowClosed, color: v.markerColor },
          label: conditional && e.label ? e.label : undefined,
        });
      }
    }

    const transitionCounts = directedTransitionCounts(executionOrder);
    for (const edge of edges) {
      const n = transitionCounts.get(`${edge.source}\0${edge.target}`) ?? 0;
      const existing = typeof edge.label === 'string' ? edge.label : undefined;
      const merged = edgeLabelWithTraversal(existing, n);
      if (merged != null) {
        edge.label = merged;
        edge.labelShowBg = true;
        edge.labelBgStyle = { fill: 'rgba(24, 24, 27, 0.92)', stroke: '#3f3f46' };
        edge.labelStyle = { fill: '#fafafa' };
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
    return null;
  }

  return (
    <div className="w-full rounded-md border border-border">
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-border bg-card/40 px-3 py-2 font-mono text-[10px] leading-tight">
        <span>
          <span className="text-muted-foreground">Nodes</span>
          <span className="mx-1.5 text-muted-foreground/80">·</span>
          <span className="text-muted-foreground">○</span> not reached
          <span className="mx-1.5 text-muted-foreground">·</span>
          <span className="text-primary">●</span> completed
          <span className="mx-1.5 text-muted-foreground">·</span>
          <span className="text-warning">●</span> running
          <span className="mx-1.5 text-muted-foreground">·</span>
          <span className="inline-flex items-center gap-0.5 rounded border border-chart-4/45 bg-chart-4/15 px-0.5 py-px text-[7px] font-semibold text-chart-4">
            <GitBranch className="size-2 text-chart-4" strokeWidth={2.5} aria-hidden />
            if
          </span>{' '}
          branch
        </span>
        <span>
          <span className="text-muted-foreground">Edges</span>
          <span className="mx-1.5 text-muted-foreground/80">·</span>
          <span className="text-primary">━</span> path taken
          <span className="mx-1.5 text-muted-foreground">·</span>
          <span className="text-warning">━</span> into / out of running
          <span className="mx-1.5 text-muted-foreground">·</span>
          <span className="text-chart-1/90">┅</span> likely next
          <span className="mx-1.5 text-muted-foreground">·</span>
          <span className="text-chart-4">┅</span> branch taken
          <span className="mx-1.5 text-muted-foreground">·</span>
          <span className="text-muted-foreground">┅</span> branch not taken
          <span className="mx-1.5 text-muted-foreground">·</span>
          <span className="rounded border border-border bg-muted px-1 py-px text-[9px] text-foreground/90">×N</span>{' '}
          repeated transition (this run)
        </span>
      </div>
      <div className="h-[300px] min-h-[220px] w-full sm:h-[320px]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick ? (_, node) => onNodeClick(node.id) : undefined}
          nodeTypes={nodeTypes}
          onInit={onInit}
          proOptions={{ hideAttribution: true }}
          fitView
          className="durion-react-flow bg-background dark"
        >
          <Background gap={20} size={1} className="opacity-30" />
          <Controls className="!m-2 overflow-hidden rounded-md border border-border !shadow-lg ring-1 ring-border/80" />
        </ReactFlow>
      </div>
    </div>
  );
}
