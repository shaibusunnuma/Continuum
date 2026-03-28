/**
 * Topology serialization utilities for graph workflows.
 *
 * Extract and serialize graph topology for external visualization tools,
 * CI pipelines, and documentation generators.
 */
import type { GraphTopology } from './types';

/**
 * Export a graph's topology as a formatted JSON string.
 * Works on any graph function returned by `graph()` that has a `.topology` property.
 *
 * @example
 * ```typescript
 * import { exportTopology } from '@durion/sdk/workflow';
 * import { researchPipeline } from './workflows';
 *
 * const json = exportTopology(researchPipeline);
 * console.log(json);
 * ```
 */
export function exportTopology(graphFn: { topology: GraphTopology }): string {
  return JSON.stringify(graphFn.topology, null, 2);
}
