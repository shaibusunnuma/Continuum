import type { ActivityStep, ParsedHistory } from './types';

export type LoadChildParsedHistory = (workflowId: string, runId: string) => Promise<ParsedHistory>;

export interface CostTreeChildLoadError {
  workflowId: string;
  runId: string;
  message: string;
}

export interface CollectCostTreeResult {
  steps: ActivityStep[];
  childLoadErrors: CostTreeChildLoadError[];
}

/** Path = parent initiated event ids from root. Prefix keeps merged step eventIds unique across workflows. */
export function stepScopePrefix(path: string[]): string {
  if (path.length === 0) return 'root';
  return ['root', ...path.map((id) => `c${id}`)].join(':');
}

function scopeSteps(steps: ActivityStep[], path: string[]): ActivityStep[] {
  const prefix = stepScopePrefix(path);
  return steps.map((s) => ({
    ...s,
    eventId: `${prefix}:${s.eventId}`,
  }));
}

function eligibleChildSteps(children: ParsedHistory['childWorkflowSteps']) {
  return children.filter(
    (c) =>
      c.outcome === 'completed' &&
      typeof c.workflowId === 'string' &&
      c.workflowId.trim() !== '' &&
      typeof c.runId === 'string' &&
      c.runId.trim() !== '',
  );
}

/**
 * Depth-first merge: current workflow's activity steps (scoped), then each completed child's subtree
 * in `childWorkflowSteps` order. Child histories are loaded via `loadChild`. Parallel fetches per level.
 */
export async function collectCostActivityStepsTree(
  parsed: ParsedHistory,
  loadChild: LoadChildParsedHistory,
  options?: { path?: string[]; visited?: Set<string> },
): Promise<CollectCostTreeResult> {
  const path = options?.path ?? [];
  const visited = options?.visited ?? new Set<string>();

  const scopedRoot = scopeSteps(parsed.activitySteps, path);
  const eligible = eligibleChildSteps(parsed.childWorkflowSteps);

  const childLoadErrors: CostTreeChildLoadError[] = [];

  const childGroups = await Promise.all(
    eligible.map(async (child) => {
      const key = `${child.workflowId}\0${child.runId!}`;
      if (visited.has(key)) {
        return [] as ActivityStep[];
      }
      visited.add(key);
      try {
        const childParsed = await loadChild(child.workflowId, child.runId!);
        const sub = await collectCostActivityStepsTree(childParsed, loadChild, {
          path: [...path, child.initiatedEventId],
          visited,
        });
        childLoadErrors.push(...sub.childLoadErrors);
        return sub.steps;
      } catch (e) {
        childLoadErrors.push({
          workflowId: child.workflowId,
          runId: child.runId!,
          message: e instanceof Error ? e.message : String(e),
        });
        return [];
      }
    }),
  );

  return {
    steps: [...scopedRoot, ...childGroups.flat()],
    childLoadErrors,
  };
}

/** Whether the root parsed history has any completed child with workflow + run id (Studio may fetch child histories for cost). */
export function hasEligibleChildWorkflowsForCost(parsed: ParsedHistory): boolean {
  return eligibleChildSteps(parsed.childWorkflowSteps).length > 0;
}
