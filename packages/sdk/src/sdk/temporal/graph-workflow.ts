/**
 * Graph orchestration primitive — workflow-sandbox code.
 * Only @temporalio/workflow imports allowed at runtime.
 * All other imports MUST be `import type` (erased at compile time).
 * Exception: GraphValidationError, GraphExecutionError used at definition time (before sandbox runs).
 */
import * as wf from '@temporalio/workflow';
import type * as sdkActivities from './activities';
import type {
  ModelCallParams,
  ModelResult,
  ToolResult,
  Message,
  RunMetadata,
  ChildRunOptions,
  Usage,
} from '../types';
import type {
  GraphConfig,
  GraphContext,
  GraphResult,
  GraphStreamState,
  GraphTopology,
  GraphCheckpoint,
  NodeFn,
  GraphNodeError,
} from '../graph/types';
import { GraphValidationError, GraphExecutionError } from '../errors';
import { validateGraphConfig, computeTerminalNodes } from '../graph/validator';
const { runModel, runTool, runLifecycleHooks } = wf.proxyActivities<
  typeof sdkActivities
>({
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: 3 },
});
// Namespaced signals/queries to avoid collisions
const userInputSignal = wf.defineSignal<[unknown]>('durion:user-input');
// ─── Topology helpers ───────────────────────────────────────────────────────
/**
 * Build a serializable topology from the graph config.
 * Conditional edges are represented as 'conditional' since we can't serialize functions.
 */
function buildTopology<TState extends Record<string, unknown>>(
  name: string,
  config: {
    nodes: Record<string, NodeFn<TState>>;
    edges: Array<{ from: string; to: string | string[] | ((state: unknown) => string | string[]) }>;
    entry: string | string[];
    exits?: string[];
  },
): GraphTopology {
  const nodeNames = Object.keys(config.nodes);
  const entries = Array.isArray(config.entry) ? config.entry : [config.entry];
  // Compute exits: explicit or inferred from terminal nodes
  const nodesWithOutgoing = new Set<string>();
  for (const edge of config.edges) {
    nodesWithOutgoing.add(edge.from);
  }
  const inferredExits = nodeNames.filter((n) => !nodesWithOutgoing.has(n));
  const exits = config.exits ?? inferredExits;
  const serializedEdges = config.edges.map((edge) => ({
    from: edge.from,
    to:
      typeof edge.to === 'function'
        ? ('conditional' as const)
        : edge.to,
  }));
  return {
    name,
    nodes: nodeNames,
    edges: serializedEdges,
    entry: entries.length === 1 ? entries[0] : entries,
    exits,
  };
}
// ─── Edge resolution ────────────────────────────────────────────────────────
/**
 * Resolve the next nodes to execute after a node completes.
 * Handles static, conditional, and fan-out edges.
 * For fan-in: a node is only ready when ALL its predecessors have completed.
 */
function resolveNextNodes(
  graphName: string,
  completedNode: string,
  state: Record<string, unknown>,
  edges: Array<{ from: string; to: string | string[] | ((state: unknown) => string | string[]) }>,
  completedSet: Set<string>,
  nodeSet: Set<string>,
  activatedSet: Set<string>,
): string[] {
  const candidates: string[] = [];
  for (const edge of edges) {
    if (edge.from !== completedNode) continue;
    let targets: string[];
    if (typeof edge.to === 'function') {
      const result = edge.to(state);
      targets = Array.isArray(result) ? result : [result];
      for (const target of targets) {
        if (!nodeSet.has(target)) {
          throw new GraphExecutionError(
            graphName,
            `Route function from "${completedNode}" returned "${target}" which is not a valid node name. ` +
            `Available nodes: [${[...nodeSet].join(', ')}].`,
          );
        }
      }
    } else if (Array.isArray(edge.to)) {
      wf.log.warn(
        `[${graphName}] Parallel fan-out detected (${completedNode} → [${edge.to.join(', ')}]). ` +
        `Phase 1 executes these sequentially. Parallel execution comes in Phase 2.`,
      );
      targets = edge.to;
    } else {
      targets = [edge.to];
    }
    candidates.push(...targets);
  }
  // Fan-in check: only gate on predecessors that have actually been activated
  // (reached during this execution). Predecessors that exist in the graph
  // but were never reached (e.g. cycle back-edges on first pass) don't block.
  const ready: string[] = [];
  for (const candidate of candidates) {
    const predecessors: string[] = [];
    for (const edge of edges) {
      const tos = typeof edge.to === 'function'
        ? []
        : Array.isArray(edge.to)
          ? edge.to
          : [edge.to];
      if (tos.includes(candidate)) {
        predecessors.push(edge.from);
      }
    }
    const activePredecessors = predecessors.filter((p) => activatedSet.has(p));
    if (activePredecessors.length === 0 || activePredecessors.every((p) => completedSet.has(p))) {
      ready.push(candidate);
    }
  }
  return ready;
}
// ─── Graph factory ──────────────────────────────────────────────────────────
/**
 * Defines a durable graph workflow with declarative topology.
 * Nodes are connected by edges (static, conditional, or fan-out).
 * Compiles to a standard Temporal workflow function.
 *
 * @param name - Logical name for the graph (use the same as your export name)
 * @param config - State schema, nodes, edges, entry, and execution constraints
 * @returns A Temporal workflow function (input) => Promise<GraphResult<TState>>
 */
export function graph<
  TState extends Record<string, unknown>,
  TNodes extends Record<string, NodeFn<TState>>,
>(
  name: string,
  config: GraphConfig<TState, TNodes>,
): ((input: Partial<TState>) => Promise<GraphResult<TState>>) & { topology: GraphTopology } {
  // ── Definition-time validation ──────────────────────────────────────────
  const warnings = validateGraphConfig(name, config as unknown as Parameters<typeof validateGraphConfig>[1]);
  // Warnings are logged when the workflow actually runs (can't console.log at definition time in sandbox)
  // ── Compute topology ────────────────────────────────────────────────────
  const topology = buildTopology(name, config as unknown as Parameters<typeof buildTopology>[1]);
  // ── Build workflow function ─────────────────────────────────────────────
  const graphFn = async function (input: Partial<TState> | GraphCheckpoint<TState>): Promise<GraphResult<TState>> {
    const info = wf.workflowInfo();
    const maxIterations = config.maxIterations ?? 25;
    const canThreshold = config.canThreshold ?? 10000;
    const budgetLimit = config.budgetLimit;
    // Log definition-time warnings
    for (const warning of warnings) {
      wf.log.warn(`[${name}] ${warning}`);
    }
    // ── Initialize state (fresh or from checkpoint) ──────────────────────
    const isCheckpoint = (input as GraphCheckpoint<TState>).resumeFrom !== undefined;
    let state: TState;
    let startIteration = 0;
    let resumeFrom: string[] | undefined;
    if (isCheckpoint) {
      const checkpoint = input as GraphCheckpoint<TState>;
      state = checkpoint.state;
      startIteration = checkpoint.iteration;
      resumeFrom = checkpoint.resumeFrom;
      wf.log.info(`[${name}] Resuming from Continue-As-New checkpoint at iteration ${startIteration}.`);
    } else {
      // Parse input through Zod schema to apply defaults
      const parseResult = (config.state as unknown as { safeParse: (v: unknown) => { success: boolean; data?: TState; error?: unknown } })
        .safeParse(input);
      if (!parseResult.success) {
        throw new GraphExecutionError(
          name,
          `Invalid input: ${JSON.stringify(parseResult.error)}`,
        );
      }
      state = parseResult.data!;
    }
    // ── Execution tracking ──────────────────────────────────────────────
    const executedNodes: string[] = [];
    const completedSet = new Set<string>();
    const nodeSet = new Set(Object.keys(config.nodes));
    let iteration = startIteration;
    let accumulatedCost = 0;
    const totalUsage: Usage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    };
    // ── HITL signal handling ────────────────────────────────────────────
    const inputQueue: unknown[] = [];
    wf.setHandler(userInputSignal, (data: unknown) => {
      inputQueue.push(data);
    });
    // ── StreamState query ───────────────────────────────────────────────
    let streamState: GraphStreamState = {
      status: 'running',
      topology: {
        nodes: topology.nodes,
        edges: topology.edges.map((e) => {
          const conditional = e.to === 'conditional';
          return {
            from: e.from,
            to: conditional ? ([] as string[]) : e.to,
            type: conditional ? ('conditional' as const) : ('static' as const),
          };
        }),
      },
      activeNodes: [],
      completedNodes: [],
      iteration: 0,
      updatedAt: new Date().toISOString(),
    };
    const streamStateQuery = wf.defineQuery<GraphStreamState>('durion:streamState');
    wf.setHandler(streamStateQuery, () => streamState);
    if (wf.patched('durion-topology-memo')) {
      wf.upsertMemo({
        'durion:topology': streamState.topology,
        'durion:primitive': 'graph',
      });
    }
    // ── Build GraphContext for a node ───────────────────────────────────
    function buildContext(nodeName: string, lastError?: GraphNodeError): GraphContext<TState> {
      return {
        state: Object.freeze({ ...state }) as Readonly<TState>,
        async model(modelId: string, params: ModelCallParams): Promise<ModelResult> {
          const messages: Message[] = params.messages ? [...params.messages] : [];
          if (params.prompt) {
            messages.push({ role: 'user', content: params.prompt });
          }
          const runModelParams = {
            modelId,
            messages,
            toolNames: params.tools,
            costCalculator: params.costCalculator,
            stream: params.stream,
            responseFormat: params.responseFormat,
            outputSchema: params.schema as Record<string, unknown> | undefined,
            traceContext: {
              workflowId: info.workflowId,
              runId: info.runId,
              workflowName: name,
              agentName: nodeName,
            },
          };
          let result;
          if (params.timeout) {
            const customActivities = wf.proxyActivities<typeof sdkActivities>({
              startToCloseTimeout: params.timeout as import('@temporalio/common').Duration,
              retry: { maximumAttempts: 3 },
            });
            result = await customActivities.runModel(runModelParams);
          } else {
            result = await runModel(runModelParams);
          }
          accumulatedCost += result.usage.costUsd;
          totalUsage.promptTokens += result.usage.promptTokens;
          totalUsage.completionTokens += result.usage.completionTokens;
          totalUsage.totalTokens += result.usage.totalTokens;
          totalUsage.costUsd += result.usage.costUsd;
          return {
            result: result.parsedObject ?? result.content,
            usage: result.usage,
          };
        },
        async tool<T = unknown>(toolName: string, toolInput: unknown): Promise<ToolResult<T>> {
          const result = await runTool({
            toolName,
            input: toolInput,
            traceContext: {
              workflowId: info.workflowId,
              runId: info.runId,
              workflowName: name,
              agentName: nodeName,
            },
          });
          return { result: result.result as T };
        },
        async run<TChildInput, TChildOutput>(
          child: (input: TChildInput) => Promise<TChildOutput>,
          childInput: TChildInput,
          options?: ChildRunOptions,
        ): Promise<TChildOutput> {
          return wf.executeChild(child, {
            args: [childInput],
            ...(options?.taskQueue ? { taskQueue: options.taskQueue } : {}),
            ...(options?.workflowId ? { workflowId: options.workflowId } : {}),
          });
        },
        async waitForInput<T = unknown>(_description: string): Promise<T> {
          streamState = {
            ...streamState,
            status: 'waiting_for_input',
            updatedAt: new Date().toISOString(),
          };
          await wf.condition(() => inputQueue.length > 0);
          streamState = {
            ...streamState,
            status: 'running',
            updatedAt: new Date().toISOString(),
          };
          return inputQueue.shift() as T;
        },
        log(event: string, data?: unknown): void {
          const payload = data !== undefined ? ` ${JSON.stringify(data)}` : '';
          wf.log.info(`[${name}] ${event}${payload}`);
        },
        metadata: {
          id: info.workflowId,
          workflowName: name,
          startedAt: new Date(),
          get accumulatedCost() {
            return accumulatedCost;
          },
        } as RunMetadata,
        lastError,
      };
    }
    // ── Merge state with reducer support ──────────────────────────────────
    function mergeState(partial: Partial<TState>): void {
      if (partial == null || typeof partial !== 'object') return;
      const merged = { ...state } as Record<string, unknown>;
      for (const [key, value] of Object.entries(partial)) {
        if (value === undefined) continue;
        const reducer = (config.reducers as Record<string, ((existing: unknown, incoming: unknown) => unknown)> | undefined)?.[key];
        if (reducer) {
          merged[key] = reducer((state as Record<string, unknown>)[key], value);
        } else {
          merged[key] = value;
        }
      }
      state = merged as TState;
    }
    // ── Execute a single node (returns partial result) ────────────────────
    async function executeNode(
      nodeName: string,
      lastError?: GraphNodeError,
    ): Promise<{ nodeName: string; result: Partial<TState> }> {
      const nodeFn = config.nodes[nodeName];
      if (!nodeFn) {
        throw new GraphExecutionError(name, `Node "${nodeName}" not found.`);
      }
      const ctx = buildContext(nodeName, lastError);
      let nodeResult: Partial<TState> | void;
      try {
        nodeResult = await nodeFn(ctx);
      } catch (err) {
        // Check for onError routing
        const fallbackNode = config.onError?.[nodeName as keyof typeof config.onError] as string | undefined;
        if (fallbackNode) {
          const errorInfo: GraphNodeError = {
            node: nodeName,
            message: err instanceof Error ? err.message : String(err),
            originalError: err,
          };
          wf.log.warn(
            `[${name}] Node "${nodeName}" failed: ${errorInfo.message}. Routing to fallback "${fallbackNode}".`,
          );
          completedSet.add(nodeName);
          executedNodes.push(nodeName);
          return executeNode(fallbackNode, errorInfo);
        }
        throw err;
      }
      const result = nodeResult != null && typeof nodeResult === 'object' ? nodeResult : {} as Partial<TState>;
      completedSet.add(nodeName);
      executedNodes.push(nodeName);
      return { nodeName, result };
    }
    // ── Main execution loop ─────────────────────────────────────────────
    // Track which nodes have been activated (placed on readyQueue at any point).
    // Used by fan-in to ignore predecessors that were never reached.
    const activatedSet = new Set<string>();
    try {
      const entries = Array.isArray(config.entry) ? [...config.entry] : [config.entry];
      let readyQueue: string[] = resumeFrom ?? (entries as string[]);
      for (const e of readyQueue) activatedSet.add(e);
      while (readyQueue.length > 0) {
        // Check maxIterations before dispatching the batch
        if (iteration >= maxIterations) {
          wf.log.warn(`[${name}] Max iterations (${maxIterations}) reached. Terminating.`);
          return {
            output: state,
            status: 'max_iterations',
            executedNodes,
            totalUsage,
          };
        }
        const currentBatch = [...readyQueue];
        readyQueue = [];
        // Clear completed flags for re-queued nodes (cyclic graphs)
        for (const nodeName of currentBatch) {
          completedSet.delete(nodeName);
        }
        // Check if batch would exceed maxIterations
        if (iteration + currentBatch.length > maxIterations) {
          wf.log.warn(`[${name}] Max iterations (${maxIterations}) would be exceeded by batch. Terminating.`);
          return {
            output: state,
            status: 'max_iterations',
            executedNodes,
            totalUsage,
          };
        }
        // ── Budget limit check (pre-flight) ─────────────────────────────
        // Check budget BEFORE dispatching the batch so the graph can still
        // complete naturally if no more nodes are queued after this batch.
        if (budgetLimit) {
          if (budgetLimit.maxCostUsd !== undefined && accumulatedCost >= budgetLimit.maxCostUsd) {
            wf.log.warn(`[${name}] Budget exceeded before batch: cost $${accumulatedCost.toFixed(4)} >= limit $${budgetLimit.maxCostUsd}. Terminating.`);
            return {
              output: state,
              status: 'budget_exceeded',
              executedNodes,
              totalUsage,
            };
          }
          if (budgetLimit.maxTokens !== undefined && totalUsage.totalTokens >= budgetLimit.maxTokens) {
            wf.log.warn(`[${name}] Budget exceeded before batch: ${totalUsage.totalTokens} tokens >= limit ${budgetLimit.maxTokens}. Terminating.`);
            return {
              output: state,
              status: 'budget_exceeded',
              executedNodes,
              totalUsage,
            };
          }
        }
        // Update stream state with active batch
        streamState = {
          ...streamState,
          status: 'running',
          activeNodes: [...currentBatch],
          iteration,
          updatedAt: new Date().toISOString(),
        };
        let batchResults: Array<{ nodeName: string; result: Partial<TState> }>;
        if (currentBatch.length === 1) {
          // Single node — no parallelism overhead
          batchResults = [await executeNode(currentBatch[0])];
        } else {
          // ── Parallel execution with cancellation ─────────────────────
          batchResults = await new Promise<Array<{ nodeName: string; result: Partial<TState> }>>(
            (resolve, reject) => {
              const scope = new wf.CancellationScope();
              scope.run(async () => {
                const promises = currentBatch.map(async (nodeName) => {
                  try {
                    return await executeNode(nodeName);
                  } catch (err) {
                    // No onError for this node (executeNode already tried onError routing)
                    // Cancel siblings and propagate
                    scope.cancel();
                    throw err;
                  }
                });
                const results = await Promise.all(promises);
                resolve(results);
              }).catch(reject);
            },
          );
        }
        iteration += batchResults.length;
        // ── Merge results with field-overlap detection ─────────────────
        if (batchResults.length > 1) {
          // Detect overlapping fields in parallel batch
          const fieldWriters = new Map<string, string[]>();
          for (const { nodeName, result } of batchResults) {
            for (const key of Object.keys(result)) {
              if (!fieldWriters.has(key)) fieldWriters.set(key, []);
              fieldWriters.get(key)!.push(nodeName);
            }
          }
          for (const [field, writers] of fieldWriters) {
            if (writers.length > 1 && !(config.reducers as Record<string, unknown> | undefined)?.[field]) {
              wf.log.warn(
                `[${name}] Parallel nodes [${writers.join(', ')}] wrote field "${field}" without a reducer. ` +
                `Last-write-wins in batch order. Define a reducer to safely merge.`,
              );
            }
          }
        }
        // Merge in batch order (deterministic for Temporal replay)
        for (const { result } of batchResults) {
          mergeState(result);
        }
        // Update stream state after batch completion
        streamState = {
          ...streamState,
          activeNodes: [],
          completedNodes: [...executedNodes],
          updatedAt: new Date().toISOString(),
        };
        // Resolve next nodes for all completed batch nodes
        for (const { nodeName } of batchResults) {
          const nextNodes = resolveNextNodes(
            name,
            nodeName,
            state as Record<string, unknown>,
            config.edges as unknown as Array<{ from: string; to: string | string[] | ((state: unknown) => string | string[]) }>,
            completedSet,
            nodeSet,
            activatedSet,
          );
          for (const next of nextNodes) {
            if (!readyQueue.includes(next)) {
              readyQueue.push(next);
              activatedSet.add(next);
            }
          }
        }

        // ── Continue-As-New check ────────────────────────────────────────
        if (canThreshold > 0 && readyQueue.length > 0) {
          const historyLength = wf.workflowInfo().historyLength;
          if (historyLength > canThreshold) {
            wf.log.info(
              `[${name}] History length ${historyLength} exceeds CAN threshold ${canThreshold}. Continuing as new.`,
            );
            const checkpoint: GraphCheckpoint<TState> = {
              state,
              completedNodes: [...executedNodes],
              iteration,
              resumeFrom: [...readyQueue],
            };
            await wf.continueAsNew<typeof graphFn>(checkpoint);
          }
        }
      }
      // ── Completed ───────────────────────────────────────────────────────
      streamState = {
        ...streamState,
        status: 'completed',
        activeNodes: [],
        completedNodes: [...executedNodes],
        updatedAt: new Date().toISOString(),
      };
      await runLifecycleHooks({
        type: 'run:complete',
        payload: {
          kind: 'workflow',
          name,
          workflowId: info.workflowId,
          runId: info.runId,
          input,
          output: state,
        },
      });
      if (wf.patched('durion-explorer-list-meta')) {
        wf.upsertMemo({
          'durion:usage': { totalTokens: totalUsage.totalTokens, costUsd: totalUsage.costUsd },
        });
      }
      return {
        output: state,
        status: 'completed',
        executedNodes,
        totalUsage,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorNode = executedNodes[executedNodes.length - 1] ?? 'unknown';
      streamState = {
        ...streamState,
        status: 'error',
        activeNodes: [],
        updatedAt: new Date().toISOString(),
      };
      if (wf.patched('durion-explorer-list-meta')) {
        wf.upsertMemo({
          'durion:usage': { totalTokens: totalUsage.totalTokens, costUsd: totalUsage.costUsd },
        });
      }
      return {
        output: state,
        status: 'error',
        executedNodes,
        totalUsage,
        error: { node: errorNode, message: errorMessage },
      };
    }
  };
  Object.defineProperty(graphFn, 'name', { value: name });
  // Attach static topology property
  const graphWithTopology = graphFn as typeof graphFn & { topology: GraphTopology };
  graphWithTopology.topology = topology;
  return graphWithTopology;
}
