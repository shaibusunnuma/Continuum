/**
 * Definition-time validation for graph() configurations.
 * All validation runs when graph() is called — before any execution.
 */
import { GraphValidationError } from '../errors';
import type { NodeFn } from './types';
// Using generic params aligned with GraphConfig but accepting loosened types
// so the validator can work without full generic inference.
interface ValidatableEdge {
  from: string;
  to: string | string[] | ((state: unknown) => string | string[]);
}
interface ValidatableConfig {
  state: unknown;
  nodes: Record<string, NodeFn<any>>;
  edges: ValidatableEdge[];
  entry: string | string[];
  exits?: string[];
  onError?: Record<string, string>;
  maxIterations?: number;
}
/**
 * Validates a graph configuration at definition time.
 * Throws GraphValidationError for fatal issues.
 * Returns warnings for non-fatal issues (logged by caller).
 */
export function validateGraphConfig(
  name: string,
  config: ValidatableConfig,
): string[] {
  const warnings: string[] = [];
  const nodeNames = Object.keys(config.nodes);
  const nodeSet = new Set(nodeNames);
  // ── Fatal checks ──────────────────────────────────────────────────────
  // State schema must be provided
  if (config.state == null || typeof config.state !== 'object') {
    throw new GraphValidationError(name, 'state must be a Zod schema.');
  }
  // At least one node
  if (nodeNames.length === 0) {
    throw new GraphValidationError(name, 'At least one node must be defined.');
  }
  // Validate node functions
  for (const [nodeName, fn] of Object.entries(config.nodes)) {
    if (typeof fn !== 'function') {
      throw new GraphValidationError(name, `Node "${nodeName}" must be a function.`);
    }
  }
  // Entry must reference existing node(s)
  const entries = Array.isArray(config.entry) ? config.entry : [config.entry];
  if (entries.length === 0) {
    throw new GraphValidationError(name, 'entry must specify at least one node.');
  }
  for (const entry of entries) {
    if (!nodeSet.has(entry)) {
      throw new GraphValidationError(
        name,
        `entry "${entry}" does not reference an existing node. Available nodes: [${nodeNames.join(', ')}].`,
      );
    }
  }
  // Validate edges
  for (let i = 0; i < config.edges.length; i++) {
    const edge = config.edges[i];
    // 'from' must reference an existing node
    if (!nodeSet.has(edge.from)) {
      throw new GraphValidationError(
        name,
        `Edge ${i}: from "${edge.from}" does not reference an existing node.`,
      );
    }
    // 'to' — validate static targets (functions validated at runtime)
    if (typeof edge.to === 'string') {
      if (!nodeSet.has(edge.to)) {
        throw new GraphValidationError(
          name,
          `Edge ${i}: to "${edge.to}" does not reference an existing node.`,
        );
      }
    } else if (Array.isArray(edge.to)) {
      for (const target of edge.to) {
        if (!nodeSet.has(target)) {
          throw new GraphValidationError(
            name,
            `Edge ${i}: to includes "${target}" which does not reference an existing node.`,
          );
        }
      }
    } else if (typeof edge.to !== 'function') {
      throw new GraphValidationError(
        name,
        `Edge ${i}: to must be a node name, array of names, or route function.`,
      );
    }
  }
  // Validate onError references
  if (config.onError) {
    for (const [sourceNode, fallbackNode] of Object.entries(config.onError)) {
      if (!nodeSet.has(sourceNode)) {
        throw new GraphValidationError(
          name,
          `onError key "${sourceNode}" does not reference an existing node.`,
        );
      }
      if (!nodeSet.has(fallbackNode)) {
        throw new GraphValidationError(
          name,
          `onError value "${fallbackNode}" (fallback for "${sourceNode}") does not reference an existing node.`,
        );
      }
    }
  }
  // Validate exits references
  if (config.exits) {
    for (const exit of config.exits) {
      if (!nodeSet.has(exit)) {
        throw new GraphValidationError(
          name,
          `exits includes "${exit}" which does not reference an existing node.`,
        );
      }
    }
  }
  // At least one terminal node must exist, unless conditional edges can act as dynamic exits
  const nodesWithOutgoing = new Set<string>();
  for (const edge of config.edges) {
    nodesWithOutgoing.add(edge.from);
  }
  const terminalNodes = nodeNames.filter((n) => !nodesWithOutgoing.has(n));
  if (terminalNodes.length === 0) {
    const hasConditionalEdges = config.edges.some((e) => typeof e.to === 'function');
    if (hasConditionalEdges) {
      // Conditional edges can return [] at runtime, making the graph exit dynamically.
      // This is valid for cyclic graphs like evaluation loops.
      warnings.push(
        'No static terminal node found. Graph relies on conditional edges to terminate. ' +
        'Ensure at least one conditional edge can return an empty array or the graph will loop until maxIterations.',
      );
    } else {
      throw new GraphValidationError(
        name,
        'No terminal node found. At least one node must have no outgoing edges, or use a conditional edge that can return [].',
      );
    }
  }
  // Validate maxIterations
  if (
    config.maxIterations !== undefined &&
    (typeof config.maxIterations !== 'number' ||
      !Number.isInteger(config.maxIterations) ||
      config.maxIterations < 1)
  ) {
    throw new GraphValidationError(
      name,
      'maxIterations must be a positive integer.',
    );
  }
  // ── Non-fatal warnings ────────────────────────────────────────────────
  // Warn about unreachable nodes (no path from entry)
  const reachable = computeReachable(entries, config.edges);
  for (const nodeName of nodeNames) {
    if (!reachable.has(nodeName)) {
      warnings.push(
        `Node "${nodeName}" is not reachable from entry node(s). It may be a target of conditional edges not statically analyzable.`,
      );
    }
  }
  return warnings;
}
/**
 * Compute the set of nodes reachable from entry via static edges (BFS).
 * Conditional edges (functions) are not followed — their targets may not be
 * statically determinable.
 */
function computeReachable(
  entries: string[],
  edges: ValidatableEdge[],
): Set<string> {
  // Build adjacency list (only static edges)
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    const from = edge.from;
    if (!adj.has(from)) adj.set(from, []);
    if (typeof edge.to === 'string') {
      adj.get(from)!.push(edge.to);
    } else if (Array.isArray(edge.to)) {
      adj.get(from)!.push(...edge.to);
    }
    // Functions are skipped — can't statically determine targets
  }
  const visited = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node)) continue;
    visited.add(node);
    const neighbors = adj.get(node) || [];
    for (const n of neighbors) {
      if (!visited.has(n)) queue.push(n);
    }
  }
  return visited;
}
/**
 * Compute the set of terminal nodes (nodes with no outgoing edges).
 * Used by graph-workflow to determine when execution is complete.
 */
export function computeTerminalNodes(
  nodeNames: string[],
  edges: ValidatableEdge[],
): Set<string> {
  const nodesWithOutgoing = new Set<string>();
  for (const edge of edges) {
    nodesWithOutgoing.add(edge.from);
  }
  return new Set(nodeNames.filter((n) => !nodesWithOutgoing.has(n)));
}
