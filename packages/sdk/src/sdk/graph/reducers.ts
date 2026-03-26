/**
 * Built-in reducer functions for graph state merging under parallelism.
 *
 * Use with the `reducers` field in graph config to define how parallel node
 * results are merged for specific state fields.
 *
 * @example
 * ```typescript
 * import { graph, reducers } from '@durion/sdk/workflow';
 *
 * const pipeline = graph('pipeline', {
 *   state: MyState,
 *   nodes: { ... },
 *   edges: [ ... ],
 *   entry: ['search', 'analyze'],
 *   reducers: {
 *     results: reducers.append,     // Concatenate arrays from parallel nodes
 *     metadata: reducers.merge,     // Shallow-merge objects one level deeper
 *   },
 * });
 * ```
 */
export const reducers = {
  /** Concatenates arrays: [...existing, ...incoming]. */
  append: <T>(existing: T[], incoming: T[]): T[] => [
    ...(Array.isArray(existing) ? existing : []),
    ...(Array.isArray(incoming) ? incoming : []),
  ],
  /** Shallow-merges objects one level deeper than the default merge. */
  merge: <T extends Record<string, unknown>>(existing: T, incoming: T): T => ({
    ...(existing ?? {}),
    ...incoming,
  }) as T,
} as const;
