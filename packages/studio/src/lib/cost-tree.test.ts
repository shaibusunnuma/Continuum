import { describe, expect, it, vi } from 'vitest';
import type { ParsedHistory } from './types';
import {
  collectCostActivityStepsTree,
  compositionCostFetchKey,
  hasEligibleChildWorkflowsForCost,
  stepScopePrefix,
} from './cost-tree';

const emptyParsed = (): ParsedHistory => ({
  events: [],
  input: null,
  result: null,
  memo: {},
  workflowType: null,
  taskQueue: null,
  activitySteps: [],
  executedNodes: null,
  topology: null,
  activitySpans: [],
  childWorkflowSteps: [],
  childWorkflowSpans: [],
  historyStartMs: null,
  historyEndMs: null,
});

describe('compositionCostFetchKey', () => {
  it('is stable for same logical history despite new object references', () => {
    const mk = (): ParsedHistory => ({
      ...emptyParsed(),
      events: [{ eventId: '9', eventType: 'x', label: 'e' }],
      activitySteps: [
        { eventId: '5', activityName: 'runModel' },
        { eventId: '7', activityName: 'runTool' },
      ],
      childWorkflowSteps: [
        {
          initiatedEventId: '4',
          workflowType: 'c',
          workflowId: 'wf-c',
          runId: 'r1',
          outcome: 'completed',
        },
      ],
    });
    const a = mk();
    const b = mk();
    expect(compositionCostFetchKey('w1', 'run-a', a)).toBe(compositionCostFetchKey('w1', 'run-a', b));
  });

  it('changes when a new history tail event appears', () => {
    const base = emptyParsed();
    base.events = [{ eventId: '1', eventType: 'x', label: 'a' }];
    base.activitySteps = [{ eventId: '5', activityName: 'runModel' }];
    const k1 = compositionCostFetchKey('w', undefined, base);
    const next = { ...base, events: [...base.events, { eventId: '2', eventType: 'y', label: 'b' }] };
    const k2 = compositionCostFetchKey('w', undefined, next);
    expect(k1).not.toBe(k2);
  });
});

describe('stepScopePrefix', () => {
  it('roots at root', () => {
    expect(stepScopePrefix([])).toBe('root');
  });
  it('chains initiated ids', () => {
    expect(stepScopePrefix(['4'])).toBe('root:c4');
    expect(stepScopePrefix(['4', '9'])).toBe('root:c4:c9');
  });
});

describe('hasEligibleChildWorkflowsForCost', () => {
  it('is false without children', () => {
    expect(hasEligibleChildWorkflowsForCost(emptyParsed())).toBe(false);
  });
  it('is false when child missing runId', () => {
    const p = emptyParsed();
    p.childWorkflowSteps = [
      {
        initiatedEventId: '3',
        workflowType: 'w',
        workflowId: 'wf-child',
        outcome: 'completed',
      },
    ];
    expect(hasEligibleChildWorkflowsForCost(p)).toBe(false);
  });
  it('is true for completed child with workflowId and runId', () => {
    const p = emptyParsed();
    p.childWorkflowSteps = [
      {
        initiatedEventId: '3',
        workflowType: 'w',
        workflowId: 'wf-child',
        runId: 'r1',
        outcome: 'completed',
      },
    ];
    expect(hasEligibleChildWorkflowsForCost(p)).toBe(true);
  });
});

describe('collectCostActivityStepsTree', () => {
  it('scopes root steps only when no eligible children', async () => {
    const parent: ParsedHistory = {
      ...emptyParsed(),
      activitySteps: [
        { eventId: '5', activityName: 'runModel', result: { usage: { costUsd: 0.01, promptTokens: 1, completionTokens: 2 } } },
      ],
    };
    const loadChild = vi.fn();
    const { steps, childLoadErrors } = await collectCostActivityStepsTree(parent, loadChild);
    expect(loadChild).not.toHaveBeenCalled();
    expect(childLoadErrors).toEqual([]);
    expect(steps).toHaveLength(1);
    expect(steps[0].eventId).toBe('root:5');
    expect(steps[0].activityName).toBe('runModel');
  });

  it('merges child activity steps with scoped ids', async () => {
    const child: ParsedHistory = {
      ...emptyParsed(),
      activitySteps: [
        {
          eventId: '7',
          activityName: 'runModel',
          result: { usage: { costUsd: 0.02, promptTokens: 3, completionTokens: 4 } },
        },
      ],
    };
    const parent: ParsedHistory = {
      ...emptyParsed(),
      activitySteps: [
        { eventId: '5', activityName: 'runModel', result: { usage: { costUsd: 0.01, promptTokens: 1, completionTokens: 1 } } },
      ],
      childWorkflowSteps: [
        {
          initiatedEventId: '4',
          workflowType: 'childWf',
          workflowId: 'wf-child',
          runId: 'run-child',
          outcome: 'completed',
        },
      ],
    };

    const loadChild = vi.fn().mockResolvedValue(child);
    const { steps, childLoadErrors } = await collectCostActivityStepsTree(parent, loadChild);

    expect(loadChild).toHaveBeenCalledTimes(1);
    expect(loadChild).toHaveBeenCalledWith('wf-child', 'run-child');
    expect(childLoadErrors).toEqual([]);
    expect(steps).toHaveLength(2);
    expect(steps[0].eventId).toBe('root:5');
    expect(steps[1].eventId).toBe('root:c4:7');
    expect(steps[1].result).toEqual(child.activitySteps[0].result);
  });

  it('records load errors and keeps parent steps', async () => {
    const parent: ParsedHistory = {
      ...emptyParsed(),
      activitySteps: [{ eventId: '5', activityName: 'runTool' }],
      childWorkflowSteps: [
        {
          initiatedEventId: '4',
          workflowType: 'childWf',
          workflowId: 'wf-child',
          runId: 'run-child',
          outcome: 'completed',
        },
      ],
    };
    const loadChild = vi.fn().mockRejectedValue(new Error('network'));
    const { steps, childLoadErrors } = await collectCostActivityStepsTree(parent, loadChild);
    expect(steps).toEqual([{ ...parent.activitySteps[0], eventId: 'root:5' }]);
    expect(childLoadErrors).toEqual([
      { workflowId: 'wf-child', runId: 'run-child', message: 'network' },
    ]);
  });

  it('skips second reference to same execution (visited)', async () => {
    const child: ParsedHistory = {
      ...emptyParsed(),
      activitySteps: [{ eventId: '1', activityName: 'runModel' }],
    };
    const parent: ParsedHistory = {
      ...emptyParsed(),
      activitySteps: [],
      childWorkflowSteps: [
        {
          initiatedEventId: '10',
          workflowType: 'w',
          workflowId: 'same-wf',
          runId: 'same-run',
          outcome: 'completed',
        },
        {
          initiatedEventId: '11',
          workflowType: 'w',
          workflowId: 'same-wf',
          runId: 'same-run',
          outcome: 'completed',
        },
      ],
    };
    const loadChild = vi.fn().mockResolvedValue(child);
    const { steps } = await collectCostActivityStepsTree(parent, loadChild);
    expect(loadChild).toHaveBeenCalledTimes(1);
    expect(steps.filter((s) => s.activityName === 'runModel')).toHaveLength(1);
  });

  it('nests grandchildren with longer prefix', async () => {
    const grandchild: ParsedHistory = {
      ...emptyParsed(),
      activitySteps: [{ eventId: '99', activityName: 'runModel' }],
    };
    const mid: ParsedHistory = {
      ...emptyParsed(),
      activitySteps: [{ eventId: '8', activityName: 'runModel' }],
      childWorkflowSteps: [
        {
          initiatedEventId: '20',
          workflowType: 'g',
          workflowId: 'wf-grand',
          runId: 'run-grand',
          outcome: 'completed',
        },
      ],
    };
    const parent: ParsedHistory = {
      ...emptyParsed(),
      activitySteps: [{ eventId: '5', activityName: 'runModel' }],
      childWorkflowSteps: [
        {
          initiatedEventId: '4',
          workflowType: 'm',
          workflowId: 'wf-mid',
          runId: 'run-mid',
          outcome: 'completed',
        },
      ],
    };

    const loadChild = vi.fn(async (wfId: string) => {
      if (wfId === 'wf-mid') return mid;
      if (wfId === 'wf-grand') return grandchild;
      throw new Error(`unexpected ${wfId}`);
    });

    const { steps } = await collectCostActivityStepsTree(parent, loadChild);
    expect(steps.map((s) => s.eventId)).toEqual(['root:5', 'root:c4:8', 'root:c4:c20:99']);
  });
});
