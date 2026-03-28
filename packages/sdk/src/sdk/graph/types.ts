/**
 * Type definitions for the Durion graph() orchestration primitive.
 *
 * Graphs define a declarative topology of nodes connected by edges,
 * compiled to a standard Temporal workflow function.
 */
import type { ZodType } from 'zod';
import type {
  ModelCallParams,
  ModelResult,
  ToolResult,
  ChildRunOptions,
  RunMetadata,
  Usage,
  StreamState,
  BudgetLimit,
} from '../types';
// ─── Graph Context ──────────────────────────────────────────────────────────
/**
 * Context passed to each graph node. Same ctx.* API as workflow(), plus typed state.
 * Nodes read from `ctx.state` and return `Partial<TState>` updates.
 */
export interface GraphContext<TState> {
  /** Current graph state — read-only snapshot. Nodes return partial updates. */
  readonly state: Readonly<TState>;
  model(modelId: string, params: ModelCallParams): Promise<ModelResult>;
  tool<T = unknown>(toolName: string, input: unknown): Promise<ToolResult<T>>;
  run<TChildInput, TChildOutput>(
    child: (input: TChildInput) => Promise<TChildOutput>,
    input: TChildInput,
    options?: ChildRunOptions,
  ): Promise<TChildOutput>;
  waitForInput<T = unknown>(description: string): Promise<T>;
  log(event: string, data?: unknown): void;
  metadata: RunMetadata;
  /** Set only inside onError handler nodes. Contains the error from the failed predecessor. */
  lastError?: GraphNodeError;
}
// ─── Graph Node Error ───────────────────────────────────────────────────────
/** Structured error information available to fallback nodes via ctx.lastError. */
export interface GraphNodeError {
  /** Name of the node that failed. */
  node: string;
  /** Error message. */
  message: string;
  /** Original error object. */
  originalError: unknown;
}
// ─── Node ───────────────────────────────────────────────────────────────────
/**
 * A graph node function: reads state via ctx.state, calls ctx.model/tool/run,
 * returns partial state updates. Returning void or undefined is treated as no state change.
 */
export type NodeFn<TState> = (
  ctx: GraphContext<TState>,
) => Promise<Partial<TState> | void>;
// ─── Edges ──────────────────────────────────────────────────────────────────
/** Reference to a node name, constrained to keys of the nodes record. */
export type NodeRef<TNodes> = keyof TNodes & string;
/**
 * Edge target: static node name, array of node names (fan-out),
 * or route function (conditional edge).
 */
export type EdgeTarget<TState, TNodes> =
  | NodeRef<TNodes>
  | NodeRef<TNodes>[]
  | ((state: Readonly<TState>) => NodeRef<TNodes> | NodeRef<TNodes>[]);
/** A graph edge: connects a source node to one or more target nodes. */
export interface Edge<TState, TNodes> {
  from: NodeRef<TNodes>;
  to: EdgeTarget<TState, TNodes>;
}
// ─── Reducers (Phase 2, type designed now) ──────────────────────────────────
/** Custom merge function for a single state field under parallel execution. */
export type Reducer<T> = (existing: T, incoming: T) => T;
// ─── Graph Config ───────────────────────────────────────────────────────────
/**
 * Configuration for graph(). Defines the topology, state schema, nodes, edges,
 * and execution constraints.
 */
export interface GraphConfig<
  TState extends Record<string, unknown>,
  TNodes extends Record<string, NodeFn<TState>>,
> {
  /** Zod schema for the graph state. Input is validated and defaults are applied. */
  state: ZodType<TState>;
  /** Named node functions. Each receives GraphContext and returns partial state updates. */
  nodes: TNodes;
  /** Edge definitions connecting nodes. */
  edges: Edge<TState, TNodes>[];
  /** Entry node(s). Single name or array for parallel start. */
  entry: NodeRef<TNodes> | NodeRef<TNodes>[];
  /** Optional: explicit exit nodes. If omitted, inferred from nodes with no outgoing edges. */
  exits?: NodeRef<TNodes>[];
  /** Max total node executions before forced termination. Default: 25. */
  maxIterations?: number;
  /** Optional error routing: node name → fallback node name. */
  onError?: Partial<Record<NodeRef<TNodes>, NodeRef<TNodes>>>;
  /** Optional per-field reducers for custom merge under parallelism. */
  reducers?: Partial<{ [K in keyof TState]: Reducer<TState[K]> }>;
  /** Optional budget limits. Graph terminates with status 'budget_exceeded' when exceeded. */
  budgetLimit?: BudgetLimit;
  /** Event history threshold for Continue-As-New. Default: 10000. Set 0 to disable. */
  canThreshold?: number;
}
// ─── Graph Result ───────────────────────────────────────────────────────────
/** Returned by a graph execution. Wraps the final state with execution metadata. */
export interface GraphResult<TState> {
  /** Final graph state after execution. May be partial on error or max_iterations. */
  output: TState;
  /** How the graph terminated. */
  status: 'completed' | 'max_iterations' | 'budget_exceeded' | 'error';
  /** Node names in the order they were executed. */
  executedNodes: string[];
  /** Aggregated token/cost usage across all model calls in the graph. */
  totalUsage: Usage;
  /** Present when status is 'error'. */
  error?: { node: string; message: string };
}
// ─── Graph Stream State ─────────────────────────────────────────────────────
/** Extended StreamState for graph workflows. Adds topology and execution progress. */
export interface GraphStreamState extends StreamState {
  /** The graph's declared topology (nodes + edges). Set once at start. */
  topology?: {
    nodes: string[];
    edges: Array<{ from: string; to: string | string[] }>;
  };
  /** Currently executing node name(s). */
  activeNodes?: string[];
  /** Completed node names in execution order. */
  completedNodes?: string[];
  /** Current iteration count. */
  iteration?: number;
}
// ─── Graph Topology (static, attached to workflow function) ─────────────────
/** Serializable graph topology, attached as a static property to the workflow function. */
export interface GraphTopology {
  name: string;
  nodes: string[];
  edges: Array<{ from: string; to: string | string[] | 'conditional' }>;
  entry: string | string[];
  exits: string[];
}
// ─── Graph Checkpoint (designed for Phase 3 Continue-As-New) ────────────────
/** Internal checkpoint for Continue-As-New. Allows resuming a graph mid-execution. */
export interface GraphCheckpoint<TState> {
  state: TState;
  completedNodes: string[];
  iteration: number;
  resumeFrom: string[];
}
